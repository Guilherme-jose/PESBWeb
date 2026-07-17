// Inicializar mapa
            const map = L.map('map').setView([-20.7153, -42.4475], 10);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);
            // Coordenadas dos municípios
    const municipalities = [
        {name: 'Araponga', coords: [-20.6668, -42.5111], color: '#3b82f6'},
        {name: 'Fervedouro', coords: [-20.7269, -42.2796], color: '#ef4444'},
        {name: 'Miradouro', coords: [-20.8931, -42.3513], color: '#eab308'},
        {name: 'Ervália', coords: [-20.8403, -42.6522], color: '#8b5cf6'},
        {name: 'Sericita', coords: [-20.4787, -42.4756], color: '#ec4899'},
        {name: 'Pedra Bonita', coords: [-20.5127, -42.3262], color: '#6366f1'},
        {name: 'Muriaé', coords: [-21.1303, -42.3674], color: '#6b7280'},
        {name: 'Divino', coords: [-20.6163, -42.1491], color: '#10b981'}
    ];

    // Adiciona marcadores dos municípios no mapa
    municipalities.forEach(mun => {
        L.circleMarker(mun.coords, {
            radius: 5,
            color: mun.color,
            fillColor: mun.color,
            fillOpacity: 0.8
        })
        .addTo(map)
        .bindPopup(`<strong>${mun.name}</strong>`);
        
    });
    // Adicionar picos principais
            const peaks = [
                {name: 'Pico do Soares', coords: [-20.72, -42.45], elevation: '1.985m'},
                {name: 'Pico do Boné', coords: [-20.75, -42.48], elevation: '1.870m'},
                {name: 'Pico do Grama', coords: [-20.71, -42.44], elevation: '1.899m'}
            ];

            peaks.forEach(peak => {
                L.marker(peak.coords, {
                    icon: L.divIcon({
                        className: 'mountain-icon',
                        html: '<i class="fas fa-mountain" style="color: #8b5a2b; font-size: 16px;"></i>',
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    })
                }).addTo(map).bindPopup(`<b>${peak.name}</b><br>Altitude: ${peak.elevation}`);
            });
            // Pontos de interesse
            const pontos = [
                {
                    name: "Sede do Parque",
                    lat: -20.7153,
                    lng: -42.4475,
                    type: "sede",
                    icon: "fas fa-home",
                    color: "red"
                },
                {
                    name: "Pico do Soares",
                    lat: -20.7200,
                    lng: -42.4600,
                    type: "pico",
                    icon: "fas fa-mountain",
                    color: "blue",
                    altitude: "1.985m"
                },
                {
                    name: "Pico do Boné",
                    lat: -20.7100,
                    lng: -42.4300,
                    type: "pico",
                    icon: "fas fa-mountain",
                    color: "blue",
                    altitude: "1.870m"
                },
                {
                    name: "Pedra do Pato",
                    lat: -20.7300,
                    lng: -42.4200,
                    type: "atrativo",
                    icon: "fas fa-water",
                    color: "cyan",
                    altitude: "1.908m"
                },
                {
                    name: "Portaria Araponga",
                    lat: -20.7050,
                    lng: -42.4550,
                    type: "portaria",
                    icon: "fas fa-door-open",
                    color: "green"
                },
                {
                    name: "Trilha do Muriqui",
                    lat: -20.7170,
                    lng: -42.4450,
                    type: "trilha",
                    icon: "fas fa-hiking",
                    color: "orange"
                }
            ];