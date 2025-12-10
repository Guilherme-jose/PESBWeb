// /home/guilherme/PESBWeb/public/javascripts/map.js

const pictures = [];

const map = L.map('map', {
    center: [-20.720, -42.400],
    zoom: 11,
    zoomControl: false
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return res.json();
}

function isValidCoord(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng);
}

function addMarkers(items) {
    items.forEach(row => {
        const lat = parseFloat(row.latitude);
        const lng = parseFloat(row.longitude);
        if (!isValidCoord(lat, lng)) {
            console.warn('Invalid coordinates for row:', row);
            return;
        }
        L.marker([lat, lng]).addTo(map)
            .on("click", () => {window.showPostPopup(row, lat, lng, getLikes(row), getFormattedDate(row))});
    });
}

function formatDate(raw) {
    if (!raw) return '';
    const d = new Date(raw);
    return !isNaN(d) ? d.toLocaleDateString() : String(raw);
}

function getLikes(row) {
    return Number(row.likes ?? row.likes_count ?? 0) || 0;
}

// single global popup helper (created once)
if (!window.showPostPopup) {
    window.showPostPopup = function (row, lat, lng, likes, formattedDate) {
        const id = row.id ?? row.post_id ?? row.pid ?? '';

        // determine initial liked state from several common field names
        const liked = !!(row.liked ?? row.is_liked ?? row.user_liked ?? row.liked_by_user ?? row.my_like ?? false);
        const likeBtnClass = liked ? 'like-btn liked' : 'like-btn';
        const btnAttrs = `class="${likeBtnClass}" data-liked="${liked ? 'true' : 'false'}" aria-pressed="${liked ? 'true' : 'false'}"`;

        L.popup({ maxWidth: 220, offset: L.point(0, -15) })
            .setLatLng([lat, lng])
            .setContent(`
            <div class="popup-container">
                <div class="popup-image-wrap">
                    <img src="/${row.path}" alt="Picture" class="popup-image">
                </div>
                <div class="popup-poster">${row.full_name ?? 'Unknown'}</div>
                <div class="popup-date">${formattedDate}</div>
                <div class="popup-meta">
                    <span id="likes-${id}" class="popup-likes ${liked ? 'liked' : ''}">❤ ${likes}</span>
                    <button type="button" id="like-btn-${id}" ${btnAttrs}>${liked ? '❤ Liked' : 'Like'}</button>
                </div>
            </div>
            `)
            .openOn(map);

        // attach handler after popup is opened
        setTimeout(() => {
            let btn = document.getElementById(`like-btn-${id}`);
            if (!btn) return;

            // remove any existing listeners by replacing the node (preserves attributes)
            const freshBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(freshBtn, btn);
            btn = freshBtn;

            btn.addEventListener('click', async function () {
                // prevent concurrent clicks while a request is in flight
                if (btn.disabled) return;
                try {
                    btn.disabled = true;
                    const token = getToken();
                    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                    const res = await fetch(`/posts/${id}/like`, {
                        method: 'POST',
                        headers,
                        credentials: 'include'
                    });
                    if (res.ok) {
                        const payload = await res.json();
                        const likesEl = document.getElementById(`likes-${id}`);
                        const newLikes = Number(payload.likes ?? likes) || 0;
                        if (likesEl) {
                            likesEl.textContent = '❤ ' + newLikes;
                        }

                        // determine new liked state: prefer server-provided flag, otherwise toggle local state
                        const wasLiked = btn.dataset.liked === 'true';
                        const newLiked = (typeof payload.liked === 'boolean') ? payload.liked : !wasLiked;
                        btn.dataset.liked = newLiked ? 'true' : 'false';
                        btn.setAttribute('aria-pressed', newLiked ? 'true' : 'false');

                        if (newLiked) {
                            btn.classList.add('liked');
                            if (likesEl) likesEl.classList.add('liked');
                            btn.innerHTML = '❤ Liked';
                        } else {
                            btn.classList.remove('liked');
                            if (likesEl) likesEl.classList.remove('liked');
                            btn.innerHTML = 'Like';
                        }
                    } else {
                        let errMsg = '';
                        try {
                            const errJson = await res.json();
                            errMsg = errJson?.message ?? JSON.stringify(errJson);
                        } catch (_) {
                            try {
                                errMsg = await res.text();
                            } catch (_) {
                                errMsg = '<unable to read error body>';
                            }
                        }
                        console.warn('Like failed', res.status, errMsg);
                    }
                } catch (e) {
                    console.error(e);
                } finally {
                    btn.disabled = false;
                }
            });
        }, 50);
    };
}

function getFormattedDate(row) {
    return formatDate(row.created_at ?? row.date ?? row.timestamp ?? null);
}

function createCard(row) {
    const likes = getLikes(row);
    const formattedDate = getFormattedDate(row);

    const card = document.createElement('div');
    card.className = 'card me-2 mb-2 post-card';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'post-img-wrap';

    const img = document.createElement('img');
    img.className = 'card-img-top post-img';
    img.src = `/${row.path}`;
    img.alt = row.description || 'Picture';

    imgWrap.appendChild(img);

    const meta = document.createElement('div');
    meta.className = 'post-meta';

    const likesEl = document.createElement('span');
    likesEl.className = 'post-likes';
    if (row.liked) likesEl.classList.add('liked');
    likesEl.textContent = `❤ ${likes}`;

    const dateEl = document.createElement('span');
    dateEl.className = 'post-date';
    dateEl.textContent = formattedDate;

    meta.appendChild(likesEl);
    meta.appendChild(dateEl);

    card.appendChild(imgWrap);
    card.appendChild(meta);

    card.addEventListener('click', () => {
        const lat = parseFloat(row.latitude);
        const lng = parseFloat(row.longitude);
        if (!isValidCoord(lat, lng)) {
            console.warn('Invalid coordinates for item, cannot center map:', row);
            return;
        }
        map.setView([lat, lng], 11);
        window.showPostPopup(row, lat, lng, likes, formattedDate);
    });

    return card;
}

async function loadPictures() {
    try {
        const data = await fetchJson('/pictures');
        pictures.splice(0, pictures.length, ...data);
    } catch (err) {
        console.error('Failed to load pictures:', err);
    }
}

async function populateSidebar() {
    try {
        const items = await fetchJson('/posts');
        const sidebar = document.getElementById('SidebarFeed');
        if (!sidebar) return;
        addMarkers(items)
        items.forEach(row => {
            if (!row.path) return;
            

            const token = getToken();
            if (token && row.id) {
                (async () => {
                    try {
                        const res = await fetch(`/posts/${encodeURIComponent(row.id)}/liked`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (res.ok) {
                            const json = await res.json();
                            row.liked = !!json.liked;
                        } else {
                            row.liked = row.liked ?? false;
                        }
                    } catch (e) {
                        console.warn('Failed to fetch liked status for post', row.id, e);
                        row.liked = row.liked ?? false;
                    }
                })();
            } else {
                row.liked = row.liked ?? false;
            }
            const card = createCard(row);
            sidebar.appendChild(card);
        });
    } catch (err) {
        console.error('Failed to populate sidebar:', err);
    }
}

(async function init() {
    await Promise.allSettled([loadPictures(), populateSidebar()]);
})();
