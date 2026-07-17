// Gráfico de biodiversidade
            const ctxBio = document.getElementById('biodiversityChart').getContext('2d');
    new Chart(ctxBio, {
        type: 'pie',
        data: {
            labels: ['Mamíferos', 'Aves', 'Répteis', 'Anfíbios', 'Plantas'],
            datasets: [{
                data: [80, 250, 30, 25, 1200], // Exemplo de dados
                backgroundColor: [
                    '#22c55e',
                    '#3b82f6',
                    '#f59e42',
                    '#a78bfa',
                    '#fbbf24'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' },
                title: {
                    display: true,
                    text: 'Diversidade de Espécies no Parque'
                }
            }
        }
    });