// GitHub Copilot

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
            .bindPopup(`<img src="/${row.path}" alt="Picture" style="width:100px;height:auto;">`);
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
        const btnStyle = liked
            ? 'padding:4px 8px;font-size:12px;cursor:pointer;border:none;background:#ff2d7a;color:#fff;border-radius:4px;'
            : 'padding:4px 8px;font-size:12px;cursor:pointer;border:1px solid #ccc;background:#fff;color:#000;border-radius:4px;';
        const btnAttrs = `data-liked="${liked ? 'true' : 'false'}" aria-pressed="${liked ? 'true' : 'false'}" style="${btnStyle}"`;

        L.popup({ maxWidth: 220, offset: L.point(0, -15) })
            .setLatLng([lat, lng])
            .setContent(`
            <div style="min-width:200px; font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                <div style="text-align:center;margin-bottom:6px;">
                <img src="/${row.path}" alt="Picture" style="max-width:180px;width:100%;height:auto;">
                </div>
                <div style="font-weight:600; margin-bottom:4px;">${row.poster ?? row.username ?? row.user ?? row.author ?? 'Unknown'}</div>
                <div style="font-size:12px;color:#666;margin-bottom:6px;">${formattedDate}</div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span id="likes-${id}" style="color:${liked ? '#ff2d7a' : '#d00'};font-weight:600;">❤ ${likes}</span>
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
                    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || null;
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
                            likesEl.style.color = '#ff2d7a';
                        }

                        // determine new liked state: prefer server-provided flag, otherwise toggle local state
                        const wasLiked = btn.dataset.liked === 'true';
                        const liked = (typeof payload.liked === 'boolean') ? payload.liked : !wasLiked;
                        btn.dataset.liked = liked ? 'true' : 'false';
                        btn.setAttribute('aria-pressed', liked ? 'true' : 'false');

                        if (liked) {
                            btn.style.backgroundColor = '#ff2d7a';
                            btn.style.color = '#fff';
                            btn.style.border = 'none';
                            btn.innerHTML = '❤ Liked';
                        } else {
                            // restore default look for "unliked" state
                            btn.style.backgroundColor = '';
                            btn.style.color = '';
                            btn.style.border = '1px solid #ccc';
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

function createCard(row) {
    const likes = getLikes(row);
    const formattedDate = formatDate(row.created_at ?? row.date ?? row.timestamp ?? null);

    const card = document.createElement('div');
    card.className = 'card me-2 mb-2';
    Object.assign(card.style, {
        width: '100px',
        height: '100px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
    });

    const imgWrap = document.createElement('div');
    Object.assign(imgWrap.style, {
        flex: '1 1 auto',
        minHeight: '0', // allow flex child to shrink properly (prevents overlap)
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8f9fa'
    });

    const img = document.createElement('img');
    img.className = 'card-img-top';
    img.src = `/${row.path}`;
    img.alt = row.description || 'Picture';
    Object.assign(img.style, {
        display: 'block',
        objectFit: 'cover',
        width: '100%',
        height: '100%'
    });

    imgWrap.appendChild(img);

    const meta = document.createElement('div');
    Object.assign(meta.style, {
        flex: '0 0 28px', // reserve a fixed area for meta so it won't overlap the image
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '11px',
        padding: '2px 6px',
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderTop: '1px solid rgba(0,0,0,0.05)',
        boxSizing: 'border-box'
    });

    const likesEl = document.createElement('span');
    likesEl.textContent = `❤ ${likes}`;
    likesEl.style.color = '#d00';

    const dateEl = document.createElement('span');
    dateEl.textContent = formattedDate;
    dateEl.style.color = '#444';

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
        addMarkers(data);
    } catch (err) {
        console.error('Failed to load pictures:', err);
    }
}

async function populateSidebar() {
    try {
        const items = await fetchJson('/posts');
        const sidebar = document.getElementById('SidebarFeed');
        if (!sidebar) return;
        items.forEach(row => {
            if (!row.path) return;
            const token = localStorage.getItem('token') || localStorage.getItem('authToken') || null;
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