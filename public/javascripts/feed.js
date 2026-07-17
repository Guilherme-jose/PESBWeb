function createPostCard(row) {
        const likes = getLikes(row);
        const formattedDate = formatDate(row.created_at ?? row.date ?? row.timestamp ?? null);

        const col = document.createElement('div');
        col.className = 'col-md-4 mb-4';

        const card = document.createElement('div');
        // REMOVED 'h-100' so the card height adjusts naturally to the image size
        card.className = 'card post-card'; 

        const img = document.createElement('img');
        img.className = 'card-img-top';
        img.src = row.path ? `${row.path}` : '/images/placeholder.png';
        img.alt = row.description || 'Picture';
        // MODIFIED: Allowed image to scale naturally without cropping
        img.style.width = '100%';
        img.style.height = 'auto'; 
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

        const initialLiked = !!(row.liked ?? false);
        applyLiked(initialLiked);

        (async () => {
          try {
            const postId = row.id ?? row.post_id ?? row.pid;
            if (!postId) return;
            const token = getToken();
            if (!token) return;

            likeBtn.disabled = true;
            const res = await fetch(`/posts/${encodeURIComponent(postId)}/liked`, {
              method: 'GET',
              headers: { 'Authorization': `Bearer ${token}` },
              credentials: 'include'
            });
            if (!res.ok) {
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

        const commentBtn = document.createElement('button');
        commentBtn.type = 'button';
        commentBtn.className = 'btn btn-sm btn-outline-secondary';
        commentBtn.textContent = 'Send';

        const commentInput = document.createElement('input');
        commentInput.style.flex = '1';
        commentInput.style.margin = '0 5px';
        commentInput.placeholder = "Escreva um comentário...";

        commentBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const commentContent = commentInput.value;
            postComment(row.id ?? row.post_id ?? row.pid, commentBtn, commentContent);
        });

        footer.appendChild(likeBtn);
        footer.appendChild(commentInput);
        footer.appendChild(commentBtn);

        cardBody.appendChild(title);
        cardBody.appendChild(desc);
        cardBody.appendChild(metaRow);

        card.appendChild(img);
        card.appendChild(cardBody);
        card.appendChild(footer);

        col.appendChild(card);
        return col;
    }