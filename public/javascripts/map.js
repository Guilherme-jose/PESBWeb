// /home/guilherme/PESBWeb/public/javascripts/map.js

const pictures = [];

let posts = null;
let iComment = 0;

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
            .on("click", () => {window.showPostPopup(row, lat, lng, getFormattedDate(row))});
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
    window.showPostPopup = function (row, lat, lng, formattedDate) {
        const id = row.id;
        const post = posts[id] || {};
        const likes = Number(post.likes ?? 0);
        const comments = Array.isArray(post.comments) ? post.comments : (row.comments ? row.comments : []);
        // determine initial liked state from several common field names
        const liked = !!(row.liked || (likes > 0 && post.liked) || false);
        const likeBtnClass = liked ? 'like-btn liked' : 'like-btn';
        const btnAttrs = `class="${likeBtnClass}" data-liked="${liked ? 'true' : 'false'}" aria-pressed="${liked ? 'true' : 'false'}"`;

        // make popup wider and change layout: image + meta on left, comments on the right
        // image will take most vertical space (bigger picture), meta aligned to bottom
        const popup = L.popup({
            maxWidth: 1200,
            minWidth: 680,
            offset: L.point(0, -10),
            autoPan: false // we'll handle panning ourselves to center the popup
        })
            .setLatLng([lat, lng])
            .setContent(`
                <div class="popup-container-horizontal" style="display:flex;gap:12px;max-width:1100px;min-width:640px;">
                    <div class="popup-left" style="flex:1;min-width:320px;display:flex;flex-direction:column;gap:8px;height:420px;">
                        <div class="popup-image-wrap" style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;background:#000;">
                            <img src="/${row.path}" alt="Picture" class="popup-image" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;">
                        </div>

                        <div class="popup-info" style="padding:6px 2px 4px 2px;display:flex;flex-direction:column;justify-content:flex-end;gap:8px;">
                            <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;">
                                <div style="display:flex;flex-direction:column;gap:6px;">
                                    <div class="popup-poster" style="font-weight:700;font-size:15px;">${row.full_name ?? 'Unknown'}</div>

                                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                        <div class="popup-date" style="color:#666;font-size:13px;">${formattedDate}</div>
                                        <div id="popup-tags-${id}" class="popup-tags" style="font-size:13px;color:#333;">Carregando tags…</div>
                                    </div>
                                </div>

                                <div class="popup-meta" style="display:flex;align-items:center;gap:8px;">
                                    <span id="likes-${id}" class="popup-likes ${liked ? 'liked' : ''}" style="font-size:14px;">❤ ${likes}</span>
                                    <button type="button" id="like-btn-${id}" ${btnAttrs} style="margin-left:6px;">${liked ? '❤ Liked' : 'Like'}</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div id="popup-comments-${id}" class="popup-comments" style="width:360px;max-width:38%;min-width:260px;overflow:auto;padding:8px;border-left:1px solid #f0f0f0;border-radius:4px;">
                        Carregando comentários…
                    </div>
                </div>

                <!-- hidden image to trigger tags fetch via onload handler (works when content injected) -->
                <img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" style="display:none"
                    onload="
                    (async function(){
                        try{
                            const res = await fetch('/posts/${id}/tags');
                            if(!res.ok){ throw new Error('status '+res.status); }
                            const json = await res.json();
                            const container = document.getElementById('popup-tags-${id}');
                            if(!container) return;
                            container.innerHTML = '';
                            const tags = json && Array.isArray(json.tags) ? json.tags : [];
                            if(tags.length === 0){
                                container.textContent = 'Sem tags';
                                return;
                            }
                            tags.forEach(t => {
                                const el = document.createElement('span');
                                el.className = 'tag-badge';
                                el.textContent = t.name;
                                el.style.marginRight = '6px';
                                el.style.padding = '4px 8px';
                                el.style.borderRadius = '12px';
                                el.style.background = '#eee';
                                el.style.fontSize = '12px';
                                container.appendChild(el);
                            });
                        }catch(e){
                            const container = document.getElementById('popup-tags-${id}');
                            if(container) container.textContent = 'Falha ao carregar tags';
                            console.warn('Failed to load tags for post ${id}', e);
                        }
                    })();
                    ">
                `)
            .openOn(map);

        // center the popup's anchor on the visible map (so popup appears centered)
        // small timeout to allow popup DOM to be positioned
        setTimeout(() => {
            try {
                const mapSize = map.getSize();
                // try to get popup height to offset the marker so the popup visual center aligns with map center
                const popupEl = document.querySelector('.leaflet-popup');
                const popupHeight = popupEl ? popupEl.offsetHeight : 0;

                // desired marker screen position: vertically lower by half the popup height so popup center ~= map center
                const desiredMarkerPos = L.point(mapSize.x / 2, mapSize.y / 2 - (popupHeight / 2));

                const markerPx = map.latLngToContainerPoint([lat, lng]);
                
                const delta = markerPx.subtract(desiredMarkerPos);
                // panBy expects the movement of the map, so invert delta
                map.panBy(delta.multiplyBy(-1), { animate: true });
            } catch (e) {
                // ignore pan errors
            }
        }, 40);

        // attach handler after popup is opened
        setTimeout(() => {
            let btn = document.getElementById(`like-btn-${id}`);
            if (!btn) return;

            // render comments as a scrollable list in the right column
            const commentsContainer = document.getElementById(`popup-comments-${id}`);
            if (commentsContainer) {
                commentsContainer.innerHTML = '';
                if (comments && comments.length > 0) {
                    comments.forEach(c => {
                        const cEl = document.createElement('div');
                        cEl.className = 'popup-comment';
                        cEl.style.padding = '8px 4px';
                        cEl.style.borderBottom = '1px solid #eee';

                        const author = document.createElement('div');
                        author.style.fontWeight = '600';
                        author.style.fontSize = '13px';
                        author.style.marginBottom = '4px';
                        author.textContent = c.author ?? c.user ?? 'Anon';

                        const content = document.createElement('div');
                        content.style.fontSize = '13px';
                        content.textContent = c.content ?? c.text ?? '';

                        cEl.appendChild(author);
                        cEl.appendChild(content);
                        commentsContainer.appendChild(cEl);
                    });
                } else {
                    commentsContainer.textContent = 'Sem comentários';
                }
            }

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

                    if (!res.ok) {
                        let errMsg = '';
                        try {
                            const errJson = await res.json();
                            errMsg = errJson?.message ?? JSON.stringify(errJson);
                        } catch (_) {
                            try { errMsg = await res.text(); } catch (_) { errMsg = '<unable to read error body>'; }
                        }
                        console.warn('Like failed', res.status, errMsg);
                        return;
                    }

                    const payload = await res.json();
                    const newLikes = Number(payload.likes ?? likes) || 0;
                    const likesEl = document.getElementById(`likes-${id}`);
                    const sideLikesEl = document.getElementById(`sidebar-likes-${id}`) || document.getElementById(`sidebar-likes-${id}`); // fallback

                    const likesText = '❤ ' + newLikes;
                    if (likesEl) likesEl.textContent = likesText;
                    if (sideLikesEl) sideLikesEl.textContent = likesText;

                    // keep posts data shape (object with likes/comments)
                    if (!posts) posts = {};
                    if (!posts[id] || typeof posts[id] !== 'object') posts[id] = { likes: newLikes, comments: comments };
                    else posts[id].likes = newLikes;

                    const wasLiked = btn.dataset.liked === 'true';
                    const newLiked = (typeof payload.liked === 'boolean') ? payload.liked : !wasLiked;

                    btn.dataset.liked = newLiked ? 'true' : 'false';
                    btn.setAttribute('aria-pressed', newLiked ? 'true' : 'false');

                    if (newLiked) {
                        if (sideLikesEl) sideLikesEl.classList.add('liked');
                        if (likesEl) likesEl.classList.add('liked');
                        btn.classList.add('liked');
                        btn.innerHTML = '❤ Liked';
                    } else {
                        if (sideLikesEl) sideLikesEl.classList.remove('liked');
                        if (likesEl) likesEl.classList.remove('liked');
                        btn.classList.remove('liked');
                        btn.innerHTML = 'Like';
                    }
                } catch (e) {
                    console.error(e);
                } finally {
                    btn.disabled = false;
                }
            });
        }, 80);
    };
}

function getFormattedDate(row) {
    return formatDate(row.created_at);
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
    likesEl.id = `sidebar-likes-${row.id}`;
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
        window.showPostPopup(row, lat, lng, formattedDate);
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
        posts = Object.fromEntries(items.map((row) => [row.id, {likes: row.likes, comments: row.comments}]));
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
                        if (!res.ok) throw new Error(`Status code ${res.status}`);
                        const json = await res.json();
                        row.liked = !!json.liked;
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

// tag filter UI + marker layer + filter logic
(function () {
    // layer to manage markers for filtering
    const markerLayer = L.layerGroup().addTo(map);

    // intercept L.marker so .addTo(...) puts markers into our layer
    const _origLMarker = L.marker;
    L.marker = function (...args) {
        const m = _origLMarker(...args);
        const _origAddTo = m.addTo.bind(m);
        m.addTo = function (layer) {
            markerLayer.addLayer(m);
            return m;
        };
        return m;
    };

    // wrap existing addMarkers to clear our layer before adding
    const _origAddMarkers = addMarkers;
    addMarkers = function (items) {
        markerLayer.clearLayers();
        return _origAddMarkers(items);
    };

    // build filter UI and insert above the sidebar
    const sidebar = document.getElementById('SidebarFeed');
    const filterContainer = document.createElement('div');
    filterContainer.className = 'tag-filter mb-2 p-2';
    filterContainer.style.display = 'flex';
    filterContainer.style.alignItems = 'center';

    const label = document.createElement('label');
    label.htmlFor = 'tag-select';
    label.textContent = 'Filtrar:';
    label.style.marginRight = '8px';

    const select = document.createElement('select');
    select.id = 'tag-select';
    select.innerHTML = '<option value="">Todos</option>';
    select.style.minWidth = '140px';

    filterContainer.appendChild(label);
    filterContainer.appendChild(select);

    if (sidebar) {
        sidebar.parentNode.insertBefore(filterContainer, sidebar);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            const sb = document.getElementById('SidebarFeed');
            if (sb) sb.parentNode.insertBefore(filterContainer, sb);
        });
    }

    // load tag list from server (fallbacks to empty)
    async function loadTags() {
        try {
            const json = await fetchJson('/tags');
            let tags = Array.isArray(json?.tags) ? json.tags.map(t => (typeof t === 'string' ? t : t.name)) : [];
            if (tags.length === 0) {
            tags = ['animal', 'planta', 'paisagem'];
            }
            Array.from(new Set(tags.filter(Boolean))).sort((a, b) => a.localeCompare(b)).forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
            });
        } catch (e) {
            console.warn('Failed to load tags', e);
            ['animal', 'planta', 'paisagem'].forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
            });
        }
    }

    // apply filter: re-fetch posts (server should support ?tag=...) and re-render sidebar + markers
    async function applyFilter(tag) {
        try {
            const url = tag ? `/tags/${encodeURIComponent(tag)}/posts` : '/posts';
            const items = await fetchJson(url);

            posts = Object.fromEntries(items.map(row => [row.id, { likes: row.likes, comments: row.comments }]));

            const sidebarEl = document.getElementById('SidebarFeed');
            if (!sidebarEl) return;
            sidebarEl.innerHTML = '';

            addMarkers(items);

            items.forEach(row => {
                if (!row.path) return;
                const token = getToken();
                if (token && row.id) {
                    (async () => {
                        try {
                            const res = await fetch(`/posts/${encodeURIComponent(row.id)}/liked`, {
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            if (!res.ok) throw new Error(`Status code ${res.status}`);
                            const json = await res.json();
                            row.liked = !!json.liked;
                        } catch (e) {
                            console.warn('Failed to fetch liked status for post', row.id, e);
                            row.liked = row.liked ?? false;
                        }
                    })();
                } else {
                    row.liked = row.liked ?? false;
                }
                const card = createCard(row);
                sidebarEl.appendChild(card);
            });
        } catch (err) {
            console.error('Failed to apply filter:', err);
        }
    }

    select.addEventListener('change', () => applyFilter(select.value || null));

    // initialize tags list (no await so init continues as before)
    loadTags().catch(() => { });
})();

(async function init() {
    await Promise.allSettled([loadPictures(), populateSidebar()]);
})();
