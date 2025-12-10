const messageEl = document.getElementById('message');
const profileEl = document.getElementById('profile');

function setMessage(txt, isError = false) {
    messageEl.textContent = txt;
    messageEl.style.color = isError ? '#b00020' : '';
}

function getToken() {
    // Try sessionStorage, then localStorage; fall back to cookie named "authToken"
    try {
        const s = sessionStorage.getItem('token');
        if (s) return s;
    } catch (e) { /* ignore storage access errors */ }
    try {
        const t = localStorage.getItem('token');
        if (t) return t;
    } catch (e) { /* ignore storage access errors */ }
    const m = document.cookie.match(/(?:^|; )authToken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}

function saveToken(token) {
    localStorage.setItem('token', token);
}

function clearToken() {
    localStorage.removeItem('token');
    // remove cookie too (if present)
    document.cookie = 'authToken=; max-age=0; path=/';
}

async function fetchStatus(token) {
    try {
        const res = await fetch('/api/status', {
            headers: { 'Authorization': 'Bearer ' + token },
        });
        if (!res.ok) {
            clearToken();
            return { ok: false, status: res.status, body: await res.json().catch(()=>null) };
        }
        const data = await res.json();
        return { ok: true, data };
    } catch (err) {
        return { ok: false, error: err };
    }
}

function showProfile(user, token) {
    profileEl.classList.remove('custom-hidden');
    document.getElementById('name').textContent = user.full_name || '(no name)';
    document.getElementById('email').textContent = user.email || '';
    document.getElementById('userId').textContent = user.id || '';
    document.getElementById('phone').textContent = user.phone || '—';
    document.getElementById('created').textContent = user.created_at ? new Date(user.created_at).toLocaleString() : '—';
    document.getElementById('raw').textContent = JSON.stringify(user, null, 2);
    document.getElementById('tokenField').value = token || '';
    // Hide status message once authenticated
    messageEl.classList.add('custom-hidden');
    messageEl.textContent = '';
    messageEl.style.color = '';
}

function showLogin(message) {
    // Redirect to dedicated login page instead of displaying the inline card
    console.info(message || 'Redirecting to login');
    window.location.replace('/login.html');
}

async function checkAuthentication() {
    setMessage('Checking authentication...');
    const token = getToken();
    if (!token) {
        showLogin('Not signed in');
        return;
    }
    const result = await fetchStatus(token);
    if (result.ok && result.data && result.data.authenticated) {
        showProfile(result.data.user, token);
    } else {
        clearToken();
        const details = result.body || result.error || {};
        showLogin('Session invalid or expired');
        console.warn('Status check failed', result, details);
    }
}


// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    clearToken();
    // redirect to login page after logout
    window.location.replace('/login.html');
});

// Copy token
document.getElementById('copyToken').addEventListener('click', async () => {
    const token = document.getElementById('tokenField').value;
    if (!token) return;
    try {
        await navigator.clipboard.writeText(token);
        setMessage('Token copied to clipboard');
    } catch {
        setMessage('Failed to copy token (clipboard blocked)', true);
    }
});

document.addEventListener('DOMContentLoaded', checkAuthentication);