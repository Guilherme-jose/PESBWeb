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
    
};

loadPictures();