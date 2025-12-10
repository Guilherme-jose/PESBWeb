// /home/guilherme/PESBWeb/public/javascripts/feed.js
// Dynamically load posts into the feed page (similar info to map sidebar)

(async function () {
    'use strict';

    function fetchJson(url) {
        return fetch(url, { credentials: 'include' }).then(async (res) => {
            if (!res.ok) throw new Error(`${url} returned ${res.status}`);
            return res.json();
        });
    }

    function formatDate(raw) {
        if (!raw) return '';
        const d = new Date(raw);
        return !isNaN(d) ? d.toLocaleString() : String(raw);
    }

    function getLikes(row) {
        return Number(row.likes ?? row.likes_count ?? 0) || 0;
    }

    function getToken() {
        const keys = ['token', 'authToken'];
        for (const k of keys) {
            const v = localStorage.getItem(k);
            if (v) return v;
            const sv = sessionStorage.getItem(k);
            if (sv) return sv;
        }
        return null;
    }

    async function toggleLike(postId, btn, likesEl) {
        if (!postId) return;
        if (btn.disabled) return;
        const token = getToken();
        if (!token) {
            // not authenticated
            alert('You must be logged in to like posts.');
            return;
        }
        try {
            btn.disabled = true;
            const res = await fetch(`/posts/${encodeURIComponent(postId)}/like`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                credentials: 'include'
            });
            if (!res.ok) {
                let err = '';
                try { err = JSON.stringify(await res.json()); } catch (_) { err = await res.text().catch(()=>''); }
                console.warn('Like failed:', res.status, err);
                return;
            }
            const payload = await res.json();
            const newLikes = Number(payload.likes ?? payload.count ?? getLikes({ likes: 0 })) || 0;
            if (likesEl) likesEl.textContent = `❤ ${newLikes}`;

            const newLiked = !!payload.liked;
            if (newLiked) {
                btn.dataset.liked = 'true';
                btn.classList.add('liked');
                btn.innerHTML = '❤ Liked';
                if (likesEl) likesEl.classList.add('liked');
            } else {
                btn.dataset.liked = 'false';
                btn.classList.remove('liked');
                btn.innerHTML = 'Like';
                if (likesEl) likesEl.classList.remove('liked');
            }
        } catch (e) {
            console.error('Error toggling like:', e);
        } finally {
            btn.disabled = false;
        }
    }

    function createPostCard(row) {
        const likes = getLikes(row);
        const formattedDate = formatDate(row.created_at ?? row.date ?? row.timestamp ?? null);

        const col = document.createElement('div');
        col.className = 'col-md-4 mb-4';

        const card = document.createElement('div');
        card.className = 'card h-100 post-card';

        const img = document.createElement('img');
        img.className = 'card-img-top';
        img.src = row.path ? `/${row.path}` : '/images/placeholder.png';
        img.alt = row.description || 'Picture';
        img.style.objectFit = 'cover';
        img.style.height = '220px';
        img.loading = 'lazy';

        const cardBody = document.createElement('div');
        cardBody.className = 'card-body d-flex flex-column';

        const title = document.createElement('h6');
        title.className = 'card-title mb-1';
        title.textContent = row.poster ?? row.username ?? row.user ?? row.author ?? 'Unknown';

        const desc = document.createElement('p');
        desc.className = 'card-text text-truncate mb-2';
        desc.textContent = row.content ?? row.description ?? '';

        const metaRow = document.createElement('div');
        metaRow.className = 'mt-auto d-flex justify-content-between align-items-center';

        const likesEl = document.createElement('span');
        likesEl.className = 'post-likes';
        if (row.liked) likesEl.classList.add('liked');
        likesEl.textContent = `❤ ${likes}`;

        const dateEl = document.createElement('small');
        dateEl.className = 'text-muted';
        dateEl.textContent = formattedDate;

        metaRow.appendChild(likesEl);
        metaRow.appendChild(dateEl);

        const footer = document.createElement('div');
        footer.className = 'card-footer bg-transparent d-flex justify-content-between align-items-center';

        const likeBtn = document.createElement('button');
        likeBtn.type = 'button';
        likeBtn.className = 'btn btn-sm btn-outline-primary';
        likeBtn.id = `like-btn-${row.id ?? row.post_id ?? ''}`;

        // apply UI for liked/unliked state
        function applyLiked(liked) {
          likeBtn.dataset.liked = liked ? 'true' : 'false';
          likeBtn.setAttribute('aria-pressed', liked ? 'true' : 'false');
          if (liked) {
            likeBtn.classList.add('liked');
            likeBtn.innerHTML = '❤ Liked';
            if (likesEl) likesEl.classList.add('liked');
          } else {
            likeBtn.classList.remove('liked');
            likeBtn.innerHTML = 'Like';
            if (likesEl) likesEl.classList.remove('liked');
          }
        }

        // prefer server-provided "row.liked" if present, fallback to false while we fetch authoritative state
        const initialLiked = !!(row.liked ?? false);
        applyLiked(initialLiked);

        // fetch authoritative liked status for the current user if we have a token
        (async () => {
          try {
            const postId = row.id ?? row.post_id ?? row.pid;
            if (!postId) return;
            const token = getToken();
            if (!token) return; // anonymous, leave initial state as-is

            likeBtn.disabled = true;
            const res = await fetch(`/posts/${encodeURIComponent(postId)}/liked`, {
              method: 'GET',
              headers: { 'Authorization': `Bearer ${token}` },
              credentials: 'include'
            });
            if (!res.ok) {
              // don't override UI on error
              console.warn('Failed to fetch liked status:', res.status);
              return;
            }
            const data = await res.json();
            if (typeof data.liked === 'boolean') {
              applyLiked(Boolean(data.liked));
            }
          } catch (err) {
            console.warn('Error fetching liked status:', err);
          } finally {
            likeBtn.disabled = false;
          }
        })();

        likeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            toggleLike(row.id ?? row.post_id ?? row.pid, likeBtn, likesEl);
        });

        const viewBtn = document.createElement('button');
        viewBtn.type = 'button';
        viewBtn.className = 'btn btn-sm btn-outline-secondary';
        viewBtn.textContent = 'View';

        viewBtn.addEventListener('click', (ev) => {

        });

        // clicking the whole card behaves like View
        card.addEventListener('click', () => viewBtn.click());

        footer.appendChild(likeBtn);
        footer.appendChild(viewBtn);

        cardBody.appendChild(title);
        cardBody.appendChild(desc);
        cardBody.appendChild(metaRow);

        card.appendChild(img);
        card.appendChild(cardBody);
        card.appendChild(footer);

        col.appendChild(card);
        return col;
    }

    async function populateFeed() {
        // find the main feed container: prefer explicit id if present, fallback to .container.mt-4
        let root = document.getElementById('FeedContainer') || document.getElementById('SidebarFeed') || document.querySelector('.container.mt-4');
        if (!root) {
            console.warn('Feed container not found; aborting populateFeed');
            return;
        }

        // clear existing content and build a grid
        root.innerHTML = '';
        const row = document.createElement('div');
        row.className = 'row';
        root.appendChild(row);

        try {
            const items = await fetchJson('/posts');
            if (!Array.isArray(items) || items.length === 0) {
                const empty = document.createElement('p');
                empty.textContent = 'No posts available.';
                root.appendChild(empty);
                return;
            }

            items.forEach((post) => {
                if (!post.path) return;
                const col = createPostCard(post);
                row.appendChild(col);
            });
        } catch (err) {
            console.error('Failed to load posts for feed:', err);
            const errEl = document.createElement('p');
            errEl.className = 'text-danger';
            errEl.textContent = 'Failed to load feed. Try again later.';
            root.appendChild(errEl);
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', populateFeed);
    } else {
        populateFeed();
    }
})();