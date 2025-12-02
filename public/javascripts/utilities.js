const navbar = ''

function load_navbar() {
    fetch('/navbar.html')
        .then(response => response.text())
        .then(data => {
            const token = localStorage.getItem('token') || sessionStorage.getItem('token');
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