var pictures = [];

// Initialize the map
const map = L.map('map', {
    center: [-20.720, -42.400],
    zoom: 11,
    zoomControl: false
});

// Add a tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

const loadPictures = async () => {
    try {
        const response = await fetch('/pictures'); // Fetch data from the API
        const data = await response.json(); // Parse the JSON response
        

        data.forEach(row => {
            if (row.latitude && row.longitude) { // Ensure latitude and longitude are valid
                L.marker([row.latitude, row.longitude]).addTo(map)
                    .bindPopup(`<img src="/${row.path}" alt="Picture" style="width:100px;height:auto;">`);
            } else {
                console.warn('Invalid coordinates for row:', row);
            }
        });
    } catch (error) {
        console.error('Failed to load pictures:', error);
        console.log(data);
    }
    // populate the sidebar with picture cards and make them clickable to center the map
    (async () => {
        try {
            const resp = await fetch('/pictures');
            const items = await resp.json();
            const sidebar = document.getElementById('SidebarFeed');
            if (!sidebar) return;

            items.forEach(row => {
                if (!row.path) return;

                const card = document.createElement('div');
                card.className = 'card me-2 mb-2';
                card.style.width = '100px';
                card.style.height = '100px';
                card.style.display = 'flex';
                card.style.flexDirection = 'column';

                const img = document.createElement('img');
                img.className = 'card-img-top';
                img.src = `/${row.path}`;
                img.alt = row.description || 'Picture';
                img.style.objectFit = 'contain';
                img.style.width = '100%';
                img.style.height = '100%';

                card.appendChild(img);

                // center map and open a popup with the image when card clicked (if coordinates exist)
                card.addEventListener('click', () => {
                    if (row.latitude && row.longitude) {
                        map.setView([row.latitude, row.longitude], 11);
                        L.popup({ maxWidth: 220 })
                            .setLatLng([row.latitude, row.longitude])
                            .setContent(`<img src="/${row.path}" alt="Picture" style="width:200px;height:auto;">`)
                            .openOn(map);
                    }
                });

                sidebar.appendChild(card);
            });
        } catch (err) {
            console.error('Failed to populate sidebar:', err);
        }
    })();
};

loadPictures();