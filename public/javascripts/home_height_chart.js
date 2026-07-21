// Gráfico de altitudes
            const ctx = document.getElementById('altitudeChart').getContext('2d');
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Pico do Soares', 'Pico Campestre', 'Pico do Grama', 'Pico do Boné', 'Pico do Itajuru', 'Pico do Cruzeiro'],
                    datasets: [{
                        label: 'Altitude (metros)',
                        data: [1985, 1908, 1899, 1870, 1585, 1684],
                        backgroundColor: [
                            '#3b82f6',
                            '#1d4ed8',
                            '#1e40af',
                            '#1e3a8a',
                            '#60a5fa',
                            '#93c5fd'
                        ],
                        borderColor: [
                            '#2563eb',
                            '#1d4ed8',
                            '#1e40af',
                            '#1e3a8a',
                            '#3b82f6',
                            '#60a5fa'
                        ],
                        borderWidth: 2,
                        borderRadius: 8,
                        borderSkipped: false,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Principais Picos do Parque Estadual Serra do Brigadeiro',
                            font: {
                                size: 16,
                                weight: 'bold'
                            }
                        },
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            min: 1500,
                            title: {
                                display: true,
                                text: 'Altitude (metros)'
                            },
                            grid: {
                                color: '#e5e7eb'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Picos'
                            },
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });