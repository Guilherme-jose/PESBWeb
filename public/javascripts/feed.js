// /home/guilherme/PESBWeb/public/javascripts/feed.js

(function () {
    'use strict';

    // --- Helpers ---

    function getAuthHeader() {
        const token = typeof getToken === 'function' ? getToken() : null;
        return token ? { 'Authorization': `Bearer ${token}` } : null;
    }

    async function fetchJson(url, options = {}) {
        const res = await fetch(url, { credentials: 'include', ...options });
        if (!res.ok) throw new Error(`${url} returned status ${res.status}`);
        return res.json();
    }

    function formatDate(raw) {
        if (!raw) return '';
        const d = new Date(raw);
        return !isNaN(d) ? d.toLocaleString() : String(raw);
    }

    /**
     * Normalizes raw API objects into a consistent shape.
     */
    function normalizePost(row) {
        return {
            id: row.id ?? row.post_id ?? row.pid,
            author: row.poster ?? row.username ?? row.user ?? row.author ?? 'Unknown',
            description: row.content ?? row.description ?? '',
            path: row.path ? String(row.path) : '/images/placeholder.png',
            likes: Number(row.likes ?? row.likes_count ?? 0) || 0,
            date: formatDate(row.created_at ?? row.date ?? row.timestamp),
            liked: !!row.liked
        };
    }

    // --- Actions ---

    async function toggleLike(postId, btn, likesEl) {
        if (!postId || btn.disabled) return;

        const authHeader = getAuthHeader();
        if (!authHeader) {
            alert('Você precisa estar logado para curtir publicações.');
            return;
        }

        try {
            btn.disabled = true;
            const payload = await fetchJson(`/posts/${encodeURIComponent(postId)}/like`, {
                method: 'POST',
                headers: authHeader
            });

            const newLikes = Number(payload.likes ?? payload.count ?? 0);
            const isLiked = !!payload.liked;

            // Update UI
            if (likesEl) {
                likesEl.textContent = `❤ ${newLikes}`;
                likesEl.classList.toggle('liked', isLiked);
            }

            btn.dataset.liked = isLiked ? 'true' : 'false';
            btn.setAttribute('aria-pressed', isLiked ? 'true' : 'false');
            btn.classList.toggle('liked', isLiked);
            btn.innerHTML = isLiked ? '❤ Liked' : 'Like';

        } catch (e) {
            console.error('Erro ao curtir a publicação:', e);
        } finally {
            btn.disabled = false;
        }
    }

    async function postComment(postId, inputEl, btnEl) {
        const content = inputEl.value.trim();
        if (!postId || !content || btnEl.disabled) return;

        const authHeader = getAuthHeader();
        if (!authHeader) {
            alert('Você precisa estar logado para comentar.');
            return;
        }

        try {
            btnEl.disabled = true;
            inputEl.disabled = true;

            await fetchJson(`/posts/${encodeURIComponent(postId)}/comment`, {
                method: 'POST',
                headers: { 
                    ...authHeader, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({ content })
            });

            // Clear input on success
            inputEl.value = '';
        } catch (e) {
            console.error('Erro ao enviar comentário:', e);
            alert('Não foi possível enviar o comentário. Tente novamente.');
        } finally {
            btnEl.disabled = false;
            inputEl.disabled = false;
            inputEl.focus();
        }
    }

    // --- DOM Construction ---

    function createPostCard(post) {
        const col = document.createElement('div');
        col.className = 'col-md-4 mb-4';

        const card = document.createElement('div');
        card.className = 'card post-card h-100 shadow-sm';

        // Image
        const img = document.createElement('img');
        img.className = 'card-img-top';
        img.src = post.path;
        img.alt = post.description || 'Picture';
        img.style.width = '100%';
        img.style.height = 'auto';
        img.loading = 'lazy';

        // Body
        const cardBody = document.createElement('div');
        cardBody.className = 'card-body d-flex flex-column';

        const title = document.createElement('h6');
        title.className = 'card-title mb-1 fw-bold';
        title.textContent = post.author;

        const desc = document.createElement('p');
        desc.className = 'card-text text-truncate mb-2';
        desc.textContent = post.description;

        const metaRow = document.createElement('div');
        metaRow.className = 'mt-auto d-flex justify-content-between align-items-center';

        const likesEl = document.createElement('span');
        likesEl.className = `post-likes ${post.liked ? 'liked' : ''}`;
        likesEl.textContent = `❤ ${post.likes}`;

        const dateEl = document.createElement('small');
        dateEl.className = 'text-muted';
        dateEl.textContent = post.date;

        metaRow.appendChild(likesEl);
        metaRow.appendChild(dateEl);

        cardBody.appendChild(title);
        cardBody.appendChild(desc);
        cardBody.appendChild(metaRow);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'card-footer bg-transparent d-flex align-items-center gap-1';

        // Like Button
        const likeBtn = document.createElement('button');
        likeBtn.type = 'button';
        likeBtn.className = `btn btn-sm btn-outline-primary ${post.liked ? 'liked' : ''}`;
        likeBtn.id = `like-btn-${post.id}`;
        likeBtn.dataset.liked = post.liked ? 'true' : 'false';
        likeBtn.setAttribute('aria-pressed', post.liked ? 'true' : 'false');
        likeBtn.innerHTML = post.liked ? '❤ Liked' : 'Like';

        likeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            toggleLike(post.id, likeBtn, likesEl);
        });

        // Comment Input
        const commentInput = document.createElement('input');
        commentInput.type = 'text';
        commentInput.className = 'form-control form-control-sm mx-1';
        commentInput.placeholder = 'Escreva um comentário...';

        // Comment Submit Button
        const commentBtn = document.createElement('button');
        commentBtn.type = 'button';
        commentBtn.className = 'btn btn-sm btn-outline-secondary';
        commentBtn.textContent = 'Enviar';

        const handleCommentSubmit = (ev) => {
            ev.stopPropagation();
            postComment(post.id, commentInput, commentBtn);
        };

        commentBtn.addEventListener('click', handleCommentSubmit);
        commentInput.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                handleCommentSubmit(ev);
            }
        });

        footer.appendChild(likeBtn);
        footer.appendChild(commentInput);
        footer.appendChild(commentBtn);

        card.appendChild(img);
        card.appendChild(cardBody);
        card.appendChild(footer);

        col.appendChild(card);
        return col;
    }

    // --- Main Feed Controller ---

    async function populateFeed() {
        const root = document.getElementById('FeedContainer') || 
                     document.getElementById('SidebarFeed') || 
                     document.querySelector('.container.mt-4');

        if (!root) {
            console.warn('Feed container not found; aborting populateFeed');
            return;
        }

        root.innerHTML = '';
        const rowContainer = document.createElement('div');
        rowContainer.className = 'row';
        root.appendChild(rowContainer);

        try {
            const rawItems = await fetchJson('/posts');
            if (!Array.isArray(rawItems) || rawItems.length === 0) {
                rowContainer.innerHTML = '<div class="col-12"><p class="text-muted">Nenhuma publicação encontrada.</p></div>';
                return;
            }

            // Standardize post models
            const posts = rawItems.map(normalizePost);

            // Fetch liked status concurrently if user is logged in
            const authHeader = getAuthHeader();
            if (authHeader) {
                await Promise.all(posts.map(async (post) => {
                    if (!post.id) return;
                    try {
                        const data = await fetchJson(`/posts/${encodeURIComponent(post.id)}/liked`, { headers: authHeader });
                        if (typeof data.liked === 'boolean') post.liked = data.liked;
                    } catch {
                        post.liked = false;
                    }
                }));
            }

            // Render elements
            posts.forEach(post => {
                if (!post.path) return;
                rowContainer.appendChild(createPostCard(post));
            });

        } catch (err) {
            console.error('Failed to load feed:', err);
            rowContainer.innerHTML = '<div class="col-12"><p class="text-danger">Erro ao carregar feed. Tente novamente mais tarde.</p></div>';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', populateFeed);
    } else {
        populateFeed();
    }
})();