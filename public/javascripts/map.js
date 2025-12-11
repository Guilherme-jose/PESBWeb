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
        const post = posts[id];
        const likes = post.likes;
        const comments = post.comments;
        // determine initial liked state from several common field names
        const liked = likes > 0;
        const likeBtnClass = liked ? 'like-btn liked' : 'like-btn';
        const btnAttrs = `class="${likeBtnClass}" data-liked="${liked ? 'true' : 'false'}" aria-pressed="${liked ? 'true' : 'false'}"`;


            L.popup({ maxWidth: 320, offset: L.point(0, -15) })
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

                <div id="popup-tags-${id}" class="popup-tags">Carregando tags…</div>

                <div id="popup-comments-${id}" class="popup-comments">
                    <span id="comment-author-${id}"></span> comentou:<br>"<span id="comment-content-${id}"></span>"
                    <div class="comment-nav">
                    <button class="comment-prev" id="comment-prev-${id}">⬅</button>
                    <button class="comment-next" id="comment-next-${id}">➡</button>
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
                            el.style.padding = '2px 6px';
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
                </div>
                `)
                .openOn(map);

        // attach handler after popup is opened
        setTimeout(() => {
            let btn = document.getElementById(`like-btn-${id}`);
            if (!btn) return;
            if (comments) {
                const firstComment = comments[0];
                const commentAuthorEl = document.getElementById(`comment-author-${id}`);
                const commentContentEl = document.getElementById(`comment-content-${id}`);
                commentAuthorEl.textContent = firstComment.author;
                commentContentEl.textContent = firstComment.content;
                iComment = 0;
                const nextCommentEl = document.getElementById(`comment-next-${id}`);
                const prevCommentEl = document.getElementById(`comment-prev-${id}`);
                prevCommentEl.disabled = true;
                nextCommentEl.disabled = iComment >= comments.length - 1;
                prevCommentEl.addEventListener('click', () => {
                    const comment = comments[--iComment];
                    commentAuthorEl.textContent = comment.author;
                    commentContentEl.textContent = comment.content;
                    nextCommentEl.disabled = false;
                    prevCommentEl.disabled = iComment <= 0;
                });
                nextCommentEl.addEventListener('click', () => {
                    const comment = comments[++iComment];
                    commentAuthorEl.textContent = comment.author;
                    commentContentEl.textContent = comment.content;
                    nextCommentEl.disabled = iComment >= comments.length - 1;
                    prevCommentEl.disabled = false;
                });
            } else {
                const commentsContainer = document.getElementById(`popup-comments-${id}`);
                commentsContainer.innerHTML = "Sem comentários";
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
                    if (res.ok) {
                        const payload = await res.json();
                        const likesElId = `likes-${id}`;
                        const likesEl = document.getElementById(likesElId);
                        const sideLikesEl = document.getElementById(`sidebar-${likesElId}`);
                        const newLikes = Number(payload.likes ?? likes) || 0;
                        const likesElContent = '❤ ' + newLikes;
                        sideLikesEl.textContent = likesElContent;
                        if (likesEl) {
                            likesEl.textContent = likesElContent;
                        }
                        posts[id] = newLikes;
                        // determine new liked state: prefer server-provided flag, otherwise toggle local state
                        const wasLiked = btn.dataset.liked === 'true';
                        const newLiked = (typeof payload.liked === 'boolean') ? payload.liked : !wasLiked;
                        btn.dataset.liked = newLiked ? 'true' : 'false';
                        btn.setAttribute('aria-pressed', newLiked ? 'true' : 'false');

                        if (newLiked) {
                            sideLikesEl.classList.add('liked');
                            btn.classList.add('liked');
                            if (likesEl) likesEl.classList.add('liked');
                            btn.innerHTML = '❤ Liked';
                        } else {
                            sideLikesEl.classList.remove('liked');
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
