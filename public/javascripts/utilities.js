const navbar = ''

function load_navbar() {
    fetch('/navbar.html')
        .then(response => response.text())
        .then(data => {
            const token = getToken();
            if (token) {
                const profileLi = `<li class="nav-item"><a class="nav-link" href="/profile.html">Profile</a></li>`;
                data = data.replace('</ul>', `${profileLi}</ul>`);
            } else {
                const loginLi = `<li class="nav-item"><a class="nav-link" href="/login.html">Login</a></li>`;
                data = data.replace('</ul>', `${loginLi}</ul>`);
            }
            document.getElementById('navbar-container').innerHTML = data;
        })
        .catch(error => console.error('Error loading navbar:', error));
}

function getToken() {
    const k = 'token';
    const v = localStorage.getItem(k);
    if (v) return v;
    const sv = sessionStorage.getItem(k);
    if (sv) return sv;
    return null;
}

document.addEventListener('DOMContentLoaded', load_navbar);