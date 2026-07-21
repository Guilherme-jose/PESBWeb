// Global State & Map Setup
let posts = {};
const markerGroup = L.layerGroup();

const map = L.map('map', {
    center: [-20.720, -42.400],
    zoom: 11,
    zoomControl: false
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

markerGroup.addTo(map);

// --- Helpers ---

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`${url} returned status ${res.status}`);
    return res.json();
}

function isValidCoord(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng);
}

function formatDate(raw) {
    if (!raw) return '';
    const d = new Date(raw);
    return !isNaN(d) ? d.toLocaleDateString() : String(raw);
}

function getAuthHeader() {
    const token = typeof getToken === 'function' ? getToken() : null;
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// --- Popup Component ---

function createPopupNode(row, lat, lng, formattedDate) {
    const id = row.id;
    const post = posts[id] || {};
    const likes = Number(post.likes ?? row.likes ?? 0);
    const comments = Array.isArray(post.comments) ? post.comments : (row.comments || []);
    let liked = !!row.liked;

    const container = document.createElement('div');
    container.className = 'popup-container-horizontal';
    container.innerHTML = `
        <div class="popup-left">
            <div class="popup-image-wrap">
                <img src="${row.path}" alt="Picture" class="popup-image">
            </div>
            <div class="popup-info">
                <div class="popup-header">
                    <div>
                        <div class="popup-poster">${row.full_name ?? 'Unknown'}</div>
                        <div class="popup-subtext">
                            <span class="popup-date">${formattedDate}</span>
                            <span id="popup-tags-${id}" class="popup-tags">Carregando tags…</span>
                        </div>
                    </div>
                    <div class="popup-meta">
                        <span id="likes-${id}" class="popup-likes ${liked ? 'liked' : ''}">❤ ${likes}</span>
                        <button type="button" id="like-btn-${id}" class="like-btn ${liked ? 'liked' : ''}" aria-pressed="${liked}">
                            ${liked ? '❤ Liked' : 'Like'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <div id="popup-comments-${id}" class="popup-comments"></div>
    `;

    // Render Comments
    const commentsContainer = container.querySelector(`#popup-comments-${id}`);
    if (comments.length > 0) {
        comments.forEach(c => {
            const cEl = document.createElement('div');
            cEl.className = 'popup-comment';
            cEl.innerHTML = `
                <div class="comment-author">${c.author ?? c.user ?? 'Anon'}</div>
                <div class="comment-text"></div>
            `;
            cEl.querySelector('.comment-text').textContent = c.content ?? c.text ?? '';
            commentsContainer.appendChild(cEl);
        });
    } else {
        commentsContainer.textContent = 'Sem comentários';
    }

    // Attach Like Handler
    const likeBtn = container.querySelector(`#like-btn-${id}`);
    likeBtn.addEventListener('click', async () => {
        if (likeBtn.disabled) return;
        likeBtn.disabled = true;

        try {
            const payload = await fetchJson(`/posts/${id}/like`, {
                method: 'POST',
                headers: getAuthHeader(),
                credentials: 'include'
            });

            liked = typeof payload.liked === 'boolean' ? payload.liked : !liked;
            const newLikes = Number(payload.likes ?? posts[id]?.likes ?? 0);

            if (posts[id]) posts[id].likes = newLikes;

            // Update UI
            const likesText = `❤ ${newLikes}`;
            const popupLikes = container.querySelector(`#likes-${id}`);
            const sideLikes = document.getElementById(`sidebar-likes-${id}`);

            if (popupLikes) popupLikes.textContent = likesText;
            if (sideLikes) sideLikes.textContent = likesText;

            likeBtn.classList.toggle('liked', liked);
            likeBtn.setAttribute('aria-pressed', liked);
            likeBtn.innerHTML = liked ? '❤ Liked' : 'Like';
        } catch (e) {
            console.error('Failed to toggle like:', e);
        } finally {
            likeBtn.disabled = false;
        }
    });

    // Asynchronously fetch tags cleanly
    (async () => {
        const tagContainer = container.querySelector(`#popup-tags-${id}`);
        try {
            const data = await fetchJson(`/posts/${id}/tags`);
            const tags = Array.isArray(data?.tags) ? data.tags : [];
            
            tagContainer.innerHTML = '';
            if (tags.length === 0) {
                tagContainer.textContent = 'Sem tags';
                return;
            }

            tags.forEach(t => {
                const el = document.createElement('span');
                el.className = 'tag-badge';
                el.textContent = t.name;
                tagContainer.appendChild(el);
            });
        } catch (e) {
            if (tagContainer) tagContainer.textContent = 'Falha ao carregar tags';
        }
    })();

    return container;
}

function showPostPopup(row, lat, lng, formattedDate) {
    const contentNode = createPopupNode(row, lat, lng, formattedDate);

    const popup = L.popup({
        maxWidth: 1200,
        minWidth: 680,
        offset: L.point(0, -10),
        autoPan: false
    })
    .setLatLng([lat, lng])
    .setContent(contentNode)
    .openOn(map);

    // Center map accurately on open
    map.once('popupopen', () => {
        const mapSize = map.getSize();
        const popupEl = popup.getElement();
        const popupHeight = popupEl ? popupEl.offsetHeight : 0;
        const desiredMarkerPos = L.point(mapSize.x / 2, mapSize.y / 2 - popupHeight / 2);
        const markerPx = map.latLngToContainerPoint([lat, lng]);

        map.panBy(markerPx.subtract(desiredMarkerPos).multiplyBy(-1), { animate: true });
    });
}

// Make available globally if required elsewhere
window.showPostPopup = showPostPopup;

// --- Sidebar & Markers ---

function createCard(row, formattedDate) {
    const likes = Number(posts[row.id]?.likes ?? row.likes ?? 0);

    const card = document.createElement('div');
    card.className = 'card me-2 mb-2 post-card';
    card.innerHTML = `
        <div class="post-img-wrap">
            <img class="card-img-top post-img" src="${row.path}" alt="${row.description || 'Picture'}">
        </div>
        <div class="post-meta">
            <span id="sidebar-likes-${row.id}" class="post-likes ${row.liked ? 'liked' : ''}">❤ ${likes}</span>
            <span class="post-date">${formattedDate}</span>
        </div>
    `;

    card.addEventListener('click', () => {
        const lat = parseFloat(row.latitude);
        const lng = parseFloat(row.longitude);
        if (!isValidCoord(lat, lng)) return;

        map.setView([lat, lng], 11);
        showPostPopup(row, lat, lng, formattedDate);
    });

    return card;
}

async function updateFeed(items) {
    markerGroup.clearLayers();

    const sidebar = document.getElementById('SidebarFeed');
    if (sidebar) sidebar.innerHTML = '';

    // Cache posts state
    posts = Object.fromEntries(items.map(r => [r.id, { likes: r.likes, comments: r.comments }]));

    // Fetch user 'liked' status concurrently for all valid posts
    const authHeader = getAuthHeader();
    if (authHeader.Authorization) {
        await Promise.all(items.map(async (row) => {
            if (!row.id) return;
            try {
                const res = await fetchJson(`/posts/${encodeURIComponent(row.id)}/liked`, { headers: authHeader });
                row.liked = !!res.liked;
            } catch {
                row.liked = false;
            }
        }));
    }

    // Render Markers & Cards
    items.forEach(row => {
        const lat = parseFloat(row.latitude);
        const lng = parseFloat(row.longitude);
        const formattedDate = formatDate(row.created_at);

        if (isValidCoord(lat, lng)) {
            L.marker([lat, lng])
                .addTo(markerGroup)
                .on('click', () => showPostPopup(row, lat, lng, formattedDate));
        }

        if (sidebar && row.path) {
            sidebar.appendChild(createCard(row, formattedDate));
        }
    });
}

// --- Tag Filter ---

function setupTagFilter() {
    const sidebar = document.getElementById('SidebarFeed');
    if (!sidebar) return;

    const filterContainer = document.createElement('div');
    filterContainer.className = 'tag-filter mb-2 p-2';

    const select = document.createElement('select');
    select.id = 'tag-select';
    select.innerHTML = '<option value="">Todos</option>';

    filterContainer.innerHTML = `<label for="tag-select" style="margin-right:8px;">Filtrar:</label>`;
    filterContainer.appendChild(select);
    sidebar.parentNode.insertBefore(filterContainer, sidebar);

    // Fetch tag list
    (async () => {
        let tags = ['animal', 'planta', 'paisagem'];
        try {
            const json = await fetchJson('/tags');
            if (Array.isArray(json?.tags) && json.tags.length > 0) {
                tags = json.tags.map(t => typeof t === 'string' ? t : t.name);
            }
        } catch (e) {
            console.warn('Using default tag fallback');
        }

        Array.from(new Set(tags.filter(Boolean))).sort().forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
        });
    })();

    select.addEventListener('change', async () => {
        const tag = select.value;
        const url = tag ? `/tags/${encodeURIComponent(tag)}/posts` : '/posts';
        try {
            const items = await fetchJson(url);
            await updateFeed(items);
        } catch (err) {
            console.error('Failed to filter feed:', err);
        }
    });
}

// --- Initialization ---

async function init() {
    setupTagFilter();
    try {
        const items = await fetchJson('/posts');
        await updateFeed(items);
    } catch (err) {
        console.error('Failed to initialize feed:', err);
    }
}

document.addEventListener('DOMContentLoaded', init);