import { SearchableDropdown } from './components.js';

const colores = {
    '< -10%': '#b2182b',
    '-10% a -6%': '#ef8a62',
    '-6% a -2%': '#fddbc7',
    '-2% a 2%': '#f5f5f5',
    '2% a 6%': '#d9f0d3',
    '6% a 10%': '#a6d96a',
    '> 10%': '#1a9641'
};

const meses = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
];

class GeoVisor {
    constructor() {
        this.data = null;
        this.filteredData = null;

        this.map = null;
        this.popup = null;
        this.isPopupFixed = false;
        this.mapReady = false;

        this.dropdownGrupo = null;
        this.dropdownSubgrupo = null;
        this.dropdownProducto = null;
        this.dropdowns = [];

        this.currentProductoPlazas = [];

        this.cityData = {};
        this.allCityKeys = new Set();
        this.selectedCities = new Set();

        this.init();
    }

    async init() {
        this.initDisclaimer();

        try {
            const response = await fetch('data/data.json');
            if (!response.ok) throw new Error('Error al cargar JSON');

            this.data = await response.json();
            this.filteredData = this.data;

            this.updateSubtitle(null);

            this.initMap();
            this.initDropdowns();

            this.extractCityData();
            this.buildCityFilter();
            this.initCityFilterButton();
            this.initInfoButton();

            this.updateDropdownsFromFilteredData();

            this.hideLoading();
        } catch (err) {
            console.error(err);
            this.showError('No se pudieron cargar los datos. Verifique que data/data.json exista.');
        }
    }

    safeNumber(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    formatDate(fecha) {
        if (!fecha) return '';

        const [year, month, day] = fecha.split('-');
        const monthIndex = parseInt(month) - 1;
        const shortYear = year.slice(-2);

        return `${day}-${meses[monthIndex]}-${shortYear}`;
    }

    updateSubtitle(productoNombre) {
        const el = document.getElementById('subtitle');
        if (!el) return;

        if (!productoNombre) {
            el.textContent = 'Seleccione un producto para ver su variación';
            return;
        }

        if (this.data && this.data.metadata) {
            const fAnt = this.formatDate(this.data.metadata.fecha_anterior);
            const fRec = this.formatDate(this.data.metadata.fecha_reciente);
            el.textContent = `Variación de precios para ${productoNombre} entre ${fAnt} y ${fRec}`;
        }
    }

    initMap() {
        this.map = new maplibregl.Map({
            container: 'map',
            style: {
                version: 8,
                sources: {
                    'carto-dark': {
                        type: 'raster',
                        tiles: [
                            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                            'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
                        ],
                        tileSize: 256
                    }
                },
                layers: [
                    {
                        id: 'carto-dark',
                        type: 'raster',
                        source: 'carto-dark'
                    }
                ]
            },
            center: [-74.0, 4.5],
            zoom: 5
        });

        this.map.addControl(new maplibregl.NavigationControl(), 'top-left');
        this.map.addControl(new maplibregl.ScaleControl({ maxWidth: 100 }), 'bottom-right');

        this.map.on('load', () => {
            this.mapReady = true;

            this.map.addSource('plazas', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });

            this.map.addLayer({
                id: 'plazas-layer',
                type: 'circle',
                source: 'plazas',
                paint: {
                    'circle-radius': 8,
                    'circle-color': '#e67e22',
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#fff'
                }
            });

            this.setupMapInteractions();

            if (this.currentProductoPlazas && this.currentProductoPlazas.length > 0) {
                this.renderPlazas(this.currentProductoPlazas);
                this.renderDashboard(this.currentProductoPlazas);
            }
        });
    }

    setupMapInteractions() {
        const popupOptions = {
            closeButton: true,
            closeOnClick: false,
            maxWidth: '250px'
        };

        this.popup = new maplibregl.Popup(popupOptions);

        this.map.on('mouseenter', 'plazas-layer', (e) => {
            if (this.isPopupFixed) return;

            this.map.getCanvas().style.cursor = 'pointer';

            if (e.features.length > 0) {
                this.showPopup(e.features[0]);
            }
        });

        this.map.on('mouseleave', 'plazas-layer', () => {
            if (this.isPopupFixed) return;

            this.map.getCanvas().style.cursor = '';
            this.popup.remove();
        });

        this.map.on('click', 'plazas-layer', (e) => {
            if (e.features.length > 0) {
                this.isPopupFixed = true;
                this.popup.options.closeOnClick = false;
                this.showPopup(e.features[0]);
            }
        });

        this.map.on('click', (e) => {
            const features = this.map.queryRenderedFeatures(e.point, {
                layers: ['plazas-layer']
            });

            if (features.length === 0 && this.isPopupFixed) {
                this.isPopupFixed = false;
                this.popup.remove();
            }
        });

        this.popup.on('close', () => {
            this.isPopupFixed = false;
        });
    }

    getArrow(variacion) {
        const v = this.safeNumber(variacion, 0);

        if (v < -10) return '↓↓';
        if (v < -6) return '↓';
        if (v < -2) return '↘';
        if (v <= 2) return '→';
        if (v <= 6) return '↗';
        if (v <= 10) return '↑';

        return '↑↑';
    }

    showPopup(feature) {
        const p = feature.properties;

        const coords = JSON.parse(p.coordinates);
        const variacion = this.safeNumber(p.variacion_pct);

        const varClass = variacion >= 0 ? 'var-up' : 'var-down';
        const varSign = variacion >= 0 ? '+' : '';
        const arrow = this.getArrow(variacion);

        const html = `
            <div class="popup-title">${p.nombre_fuente}</div>
            <div style="font-size: 11px; color: #666; margin-bottom: 6px;">
                ${p.ciudad}, ${p.departamento}
            </div>
            <div class="popup-row">
                <span>Precio Reciente:</span>
                <b>${this.formatCOP(this.safeNumber(p.precio_reciente))}</b>
            </div>
            <div class="popup-row">
                <span>Precio Anterior:</span>
                <span>${this.formatCOP(this.safeNumber(p.precio_anterior))}</span>
            </div>
            <div class="popup-row">
                <span>Variación:</span>
                <span class="${varClass}">
                    ${arrow} ${varSign}${variacion.toFixed(1)}%
                </span>
            </div>
        `;

        this.popup
            .setLngLat(coords)
            .setHTML(html)
            .addTo(this.map);
    }

    initDropdowns() {
        const onOpen = (current) => {
            this.dropdowns.forEach((d) => {
                if (d !== current) d.close();
            });
        };

        this.dropdownGrupo = new SearchableDropdown(
            'dropdown-grupo',
            'Seleccione Grupo',
            (val) => this.onGrupoChange(val),
            () => onOpen(this.dropdownGrupo)
        );

        this.dropdownSubgrupo = new SearchableDropdown(
            'dropdown-subgrupo',
            'Seleccione Subgrupo',
            (val) => this.onSubgrupoChange(val),
            () => onOpen(this.dropdownSubgrupo)
        );

        this.dropdownProducto = new SearchableDropdown(
            'dropdown-producto',
            'Seleccione Producto',
            (val) => this.onProductoChange(val),
            () => onOpen(this.dropdownProducto)
        );

        this.dropdowns = [
            this.dropdownGrupo,
            this.dropdownSubgrupo,
            this.dropdownProducto
        ];
    }

    extractCityData() {
        const deptMap = new Map();
        this.allCityKeys = new Set();

        const registerCity = (departamento, ciudad) => {
            if (!departamento || !ciudad) return;

            const key = `${departamento}::${ciudad}`;
            this.allCityKeys.add(key);

            if (!deptMap.has(departamento)) {
                deptMap.set(departamento, new Set());
            }

            deptMap.get(departamento).add(ciudad);
        };

        (this.data.grupos || []).forEach((grupo) => {
            (grupo.subgrupos || []).forEach((subgrupo) => {
                (subgrupo.productos || []).forEach((producto) => {
                    (producto.plazas || []).forEach((plaza) => {
                        registerCity(plaza.departamento, plaza.ciudad);
                    });
                });
            });
        });

        this.cityData = {};

        [...deptMap.keys()]
            .sort((a, b) => a.localeCompare(b))
            .forEach((dept) => {
                this.cityData[dept] = [...deptMap.get(dept)].sort((a, b) => a.localeCompare(b));
            });

        this.selectedCities = new Set(this.allCityKeys);
    }

    buildCityFilter() {
        const container = document.getElementById('filter-checkboxes');
        if (!container) return;

        container.innerHTML = '';

        let idx = 0;

        Object.entries(this.cityData).forEach(([departamento, ciudades]) => {
            const group = document.createElement('div');
            group.className = 'filter-city-group';

            const title = document.createElement('div');
            title.className = 'filter-city-group-title';
            title.textContent = departamento;

            group.appendChild(title);

            ciudades.forEach((ciudad) => {
                const key = `${departamento}::${ciudad}`;

                const item = document.createElement('div');
                item.className = 'filter-city-item';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `city-${idx++}`;
                checkbox.value = key;
                checkbox.checked = true;

                checkbox.addEventListener('change', () => {
                    this.onCityToggle();
                });

                const label = document.createElement('label');
                label.htmlFor = checkbox.id;
                label.textContent = ciudad;

                item.appendChild(checkbox);
                item.appendChild(label);
                group.appendChild(item);
            });

            container.appendChild(group);
        });
    }

    initCityFilterButton() {
        const filterBtn = document.getElementById('city-filter-btn');
        const filterPanel = document.getElementById('filter-panel');
        const closeBtn = document.getElementById('filter-close-btn');
        const selectAllBtn = document.getElementById('select-all-btn');
        const deselectAllBtn = document.getElementById('deselect-all-btn');

        if (!filterBtn || !filterPanel || !closeBtn || !selectAllBtn || !deselectAllBtn) return;

        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleCityFilterPanel();
        });

        closeBtn.addEventListener('click', () => {
            filterPanel.style.display = 'none';
        });

        selectAllBtn.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('#filter-checkboxes input[type="checkbox"]');
            checkboxes.forEach((cb) => {
                cb.checked = true;
            });
            this.onCityToggle();
        });

        deselectAllBtn.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('#filter-checkboxes input[type="checkbox"]');
            checkboxes.forEach((cb) => {
                cb.checked = false;
            });
            this.onCityToggle();
        });
    }

    initInfoButton() {
        const infoBtn = document.getElementById('info-btn');
        const infoTooltip = document.getElementById('info-tooltip');

        if (!infoBtn || !infoTooltip) return;

        infoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            infoTooltip.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!infoTooltip.contains(e.target) && !infoBtn.contains(e.target)) {
                infoTooltip.classList.remove('active');
            }
        });

        // Hover solo en escritorio
        if (window.innerWidth > 768) {
            const container = document.getElementById('info-container');

            infoBtn.addEventListener('mouseenter', () => {
                infoTooltip.classList.add('active');
            });

            if (container) {
                container.addEventListener('mouseleave', () => {
                    infoTooltip.classList.remove('active');
                });
            }
        }
    }

    toggleCityFilterPanel() {
        const panel = document.getElementById('filter-panel');
        if (!panel) return;

        panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
    }

    onCityToggle() {
        const checkboxes = document.querySelectorAll('#filter-checkboxes input[type="checkbox"]');

        this.selectedCities = new Set(
            Array.from(checkboxes)
                .filter((cb) => cb.checked)
                .map((cb) => cb.value)
        );

        this.applyCityFilter();
    }

    applyCityFilter() {
        if (!this.data) return;

        if (
            !this.selectedCities ||
            this.selectedCities.size === 0 ||
            this.selectedCities.size === this.allCityKeys.size
        ) {
            this.filteredData = this.data;
        } else {
            this.filteredData = this.getFilteredDataByCities(this.selectedCities);
        }

        this.currentProductoPlazas = [];

        this.resetDropdowns();
        this.updateDropdownsFromFilteredData();

        this.clearMap();
        this.hideDashboard();
        this.updateSubtitle(null);
    }

    getFilteredDataByCities(selectedCities) {
        const filtered = {
            ...this.data,
            grupos: []
        };

        (this.data.grupos || []).forEach((grupo) => {
            const newSubgrupos = [];

            (grupo.subgrupos || []).forEach((subgrupo) => {
                const newProductos = [];

                (subgrupo.productos || []).forEach((producto) => {
                    const debeIncluirse = (producto.plazas || []).some((plaza) => {
                        const key = `${plaza.departamento}::${plaza.ciudad}`;

                        // Compatibilidad con selección por key interna y/o nombre de ciudad
                        return selectedCities.has(key) || selectedCities.has(plaza.ciudad);
                    });

                    if (debeIncluirse) {
                        newProductos.push({
                            ...producto,
                            plazas: [...(producto.plazas || [])]
                        });
                    }
                });

                if (newProductos.length > 0) {
                    newSubgrupos.push({
                        ...subgrupo,
                        productos: newProductos
                    });
                }
            });

            if (newSubgrupos.length > 0) {
                filtered.grupos.push({
                    ...grupo,
                    subgrupos: newSubgrupos
                });
            }
        });

        return filtered;
    }

    resetDropdowns() {
        if (this.dropdownGrupo) {
            this.dropdownGrupo.resetSelection();
        }

        if (this.dropdownSubgrupo) {
            this.dropdownSubgrupo.resetSelection();
            this.dropdownSubgrupo.setOptions([]);
        }

        if (this.dropdownProducto) {
            this.dropdownProducto.resetSelection();
            this.dropdownProducto.setOptions([]);
        }
    }

    updateDropdownsFromFilteredData() {
        if (!this.dropdownGrupo || !this.dropdownSubgrupo || !this.dropdownProducto) return;

        const grupos = (this.filteredData?.grupos || []).map((g) => g.nombre);

        this.dropdownGrupo.resetSelection();
        this.dropdownGrupo.setOptions(grupos);

        this.dropdownSubgrupo.resetSelection();
        this.dropdownSubgrupo.setOptions([]);

        this.dropdownProducto.resetSelection();
        this.dropdownProducto.setOptions([]);
    }

    onGrupoChange(grupo) {
        this.dropdownSubgrupo.resetSelection();
        this.dropdownProducto.resetSelection();
        this.dropdownSubgrupo.setOptions([]);
        this.dropdownProducto.setOptions([]);

        this.currentProductoPlazas = [];

        this.clearMap();
        this.hideDashboard();
        this.updateSubtitle(null);

        const gData = (this.filteredData?.grupos || []).find((g) => g.nombre === grupo);

        if (gData) {
            const subgrupos = (gData.subgrupos || []).map((s) => s.nombre);
            this.dropdownSubgrupo.setOptions(subgrupos);
        }
    }

    onSubgrupoChange(subgrupo) {
        this.dropdownProducto.resetSelection();
        this.dropdownProducto.setOptions([]);

        this.currentProductoPlazas = [];

        this.clearMap();
        this.hideDashboard();
        this.updateSubtitle(null);

        const gData = (this.filteredData?.grupos || []).find(
            (g) => g.nombre === this.dropdownGrupo.selectedValue
        );

        if (!gData) return;

        const sData = (gData.subgrupos || []).find((s) => s.nombre === subgrupo);

        if (sData) {
            const productos = (sData.productos || []).map((p) => p.nombre);
            this.dropdownProducto.setOptions(productos);
        }
    }

    onProductoChange(productoNombre) {
        if (!productoNombre) {
            this.currentProductoPlazas = [];
            this.clearMap();
            this.hideDashboard();
            this.updateSubtitle(null);
            return;
        }

        const gData = (this.filteredData?.grupos || []).find(
            (g) => g.nombre === this.dropdownGrupo.selectedValue
        );

        const sData = (gData?.subgrupos || []).find(
            (s) => s.nombre === this.dropdownSubgrupo.selectedValue
        );

        const pData = (sData?.productos || []).find(
            (p) => p.nombre === productoNombre
        );

        if (!pData) {
            this.currentProductoPlazas = [];
            this.clearMap();
            this.hideDashboard();
            this.updateSubtitle(null);
            return;
        }

        this.currentProductoPlazas = pData.plazas || [];

        if (this.currentProductoPlazas.length > 0) {
            this.renderPlazas(this.currentProductoPlazas);
            this.renderDashboard(this.currentProductoPlazas);
            this.updateSubtitle(pData.nombre);
        } else {
            this.clearMap();
            this.hideDashboard();
            this.updateSubtitle(pData.nombre);
            this.showOverlayMessage('No hay datos disponibles para este producto');
        }
    }

    renderDashboard(plazasInput) {
        const dashboard = document.getElementById('dashboard');
        if (!dashboard) return;

        const plazas = (plazasInput || []).filter(Boolean);

        if (plazas.length === 0) {
            dashboard.style.display = 'none';
            return;
        }

        dashboard.style.display = 'flex';

        const plazaLabel = (p) => {
            if (!p) return '';

            if (p.nombre_fuente) return p.nombre_fuente;

            const ciudad = p.ciudad || '';
            const departamento = p.departamento ? ` (${p.departamento})` : '';

            return `${ciudad}${departamento}`.trim() || '—';
        };

        const fmtPct = (valor) => {
            const v = this.safeNumber(valor);
            const sign = v >= 0 ? '+' : '';
            return `${sign}${v.toFixed(1)}%`;
        };

        // Precio promedio
        const avgPrecio = plazas.reduce(
            (sum, p) => sum + this.safeNumber(p.precio_reciente),
            0
        ) / plazas.length;

        document.getElementById('metric-avg-value').innerHTML =
            `<span class="metric-single">${this.formatCOP(avgPrecio)}</span>`;

        // Tendencia semanal
        const avgVariacion = plazas.reduce(
            (sum, p) => sum + this.safeNumber(p.variacion_pct),
            0
        ) / plazas.length;

        const trendArrow = this.getArrow(avgVariacion);
        const trendColor = avgVariacion >= 0 ? '#1a9641' : '#b2182b';

        document.getElementById('metric-trend-value').innerHTML =
            `<span class="metric-single" style="color: ${trendColor};">${trendArrow} ${fmtPct(avgVariacion)}</span>`;

        // Mayor subida
        const maxSubida = plazas.reduce(
            (max, p) => this.safeNumber(p.variacion_pct) > this.safeNumber(max.variacion_pct) ? p : max,
            plazas[0]
        );

        const subidaVal = this.safeNumber(maxSubida.variacion_pct);
        const subidaColor = subidaVal >= 0 ? '#1a9641' : '#b2182b';

        document.getElementById('metric-max-up-value').innerHTML =
            `<span class="metric-place">${plazaLabel(maxSubida)}</span>` +
            `<span class="metric-sep">→</span>` +
            `<span class="metric-change" style="color: ${subidaColor};">${fmtPct(subidaVal)}</span>`;

        // Mayor bajada
        const maxBajada = plazas.reduce(
            (min, p) => this.safeNumber(p.variacion_pct) < this.safeNumber(min.variacion_pct) ? p : min,
            plazas[0]
        );

        const bajadaVal = this.safeNumber(maxBajada.variacion_pct);
        const bajadaColor = bajadaVal >= 0 ? '#1a9641' : '#b2182b';

        document.getElementById('metric-max-down-value').innerHTML =
            `<span class="metric-place">${plazaLabel(maxBajada)}</span>` +
            `<span class="metric-sep">→</span>` +
            `<span class="metric-change" style="color: ${bajadaColor};">${fmtPct(bajadaVal)}</span>`;

        // Plaza más barata
        const masBarata = plazas.reduce(
            (min, p) => this.safeNumber(p.precio_reciente) < this.safeNumber(min.precio_reciente) ? p : min,
            plazas[0]
        );

        document.getElementById('metric-min-price-value').innerHTML =
            `<span class="metric-place">${plazaLabel(masBarata)}</span>` +
            `<span class="metric-sep">→</span>` +
            `<span class="metric-change" style="color: #e67e22;">${this.formatCOP(this.safeNumber(masBarata.precio_reciente))}</span>`;

        // Plaza más cara
        const masCara = plazas.reduce(
            (max, p) => this.safeNumber(p.precio_reciente) > this.safeNumber(max.precio_reciente) ? p : max,
            plazas[0]
        );

        document.getElementById('metric-max-price-value').innerHTML =
            `<span class="metric-place">${plazaLabel(masCara)}</span>` +
            `<span class="metric-sep">→</span>` +
            `<span class="metric-change" style="color: #d35400;">${this.formatCOP(this.safeNumber(masCara.precio_reciente))}</span>`;
    }

    hideDashboard() {
        const dashboard = document.getElementById('dashboard');
        if (dashboard) dashboard.style.display = 'none';
    }

    renderPlazas(plazasInput) {
        if (!this.mapReady || !this.map.getSource('plazas')) {
            return;
        }

        const plazas = (plazasInput || []).filter(Boolean);

        if (plazas.length === 0) {
            this.showOverlayMessage('No hay datos disponibles para este producto');
            return;
        }

        this.hideOverlayMessage();

        const precios = plazas.map((p) => this.safeNumber(p.precio_reciente));

        const minP = Math.min(...precios);
        const maxP = Math.max(...precios);
        const medP = this.getMedian(precios);

        const features = plazas.map((p) => {
            const lon = this.safeNumber(p.longitud);
            const lat = this.safeNumber(p.latitud);
            const coords = [lon, lat];

            return {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: coords
                },
                properties: {
                    ...p,
                    precio_reciente: this.safeNumber(p.precio_reciente),
                    precio_anterior: this.safeNumber(p.precio_anterior),
                    variacion_pct: this.safeNumber(p.variacion_pct),
                    categoria: p.categoria || '',
                    coordinates: JSON.stringify(coords)
                }
            };
        });

        const geojson = {
            type: 'FeatureCollection',
            features
        };

        this.map.getSource('plazas').setData(geojson);

        const rMin = 6;
        const rMax = 20;

        if (maxP > minP) {
            this.map.setPaintProperty('plazas-layer', 'circle-radius', [
                'interpolate',
                ['linear'],
                ['get', 'precio_reciente'],
                minP, rMin,
                maxP, rMax
            ]);
        } else {
            this.map.setPaintProperty('plazas-layer', 'circle-radius', (rMin + rMax) / 2);
        }

        this.map.setPaintProperty('plazas-layer', 'circle-color', [
            'match',
            ['get', 'categoria'],
            '< -10%', colores['< -10%'],
            '-10% a -6%', colores['-10% a -6%'],
            '-6% a -2%', colores['-6% a -2%'],
            '-2% a 2%', colores['-2% a 2%'],
            '2% a 6%', colores['2% a 6%'],
            '6% a 10%', colores['6% a 10%'],
            '> 10%', colores['> 10%'],
            '#7f8c8d'
        ]);

        this.updateSizeLegend(minP, medP, maxP, rMin, rMax);
    }

    updateSizeLegend(minP, medP, maxP, rMin, rMax) {
        const calcSize = (val) => {
            if (maxP === minP) {
                return ((rMin + rMax) / 2) * 2;
            }

            const r = rMin + ((val - minP) * (rMax - rMin)) / (maxP - minP);
            return r * 2;
        };

        const sizeMax = document.getElementById('size-max');
        const sizeMed = document.getElementById('size-med');
        const sizeMin = document.getElementById('size-min');

        if (!sizeMax || !sizeMed || !sizeMin) return;

        const dMax = calcSize(maxP);
        const dMed = calcSize(medP);
        const dMin = calcSize(minP);

        sizeMax.style.width = `${dMax}px`;
        sizeMax.style.height = `${dMax}px`;

        sizeMed.style.width = `${dMed}px`;
        sizeMed.style.height = `${dMed}px`;

        sizeMin.style.width = `${dMin}px`;
        sizeMin.style.height = `${dMin}px`;

        document.getElementById('val-max').textContent = this.formatCOP(maxP);
        document.getElementById('val-med').textContent = this.formatCOP(medP);
        document.getElementById('val-min').textContent = this.formatCOP(minP);
    }

    clearMap() {
        if (this.mapReady && this.map.getSource('plazas')) {
            this.map.getSource('plazas').setData({
                type: 'FeatureCollection',
                features: []
            });
        }

        this.hideOverlayMessage();
    }

    showOverlayMessage(msg) {
        const mapContainer = document.getElementById('map-container');
        if (!mapContainer) return;

        let el = document.getElementById('data-message');

        if (!el) {
            el = document.createElement('div');
            el.id = 'data-message';
            el.className = 'map-overlay';
            mapContainer.appendChild(el);
        }

        el.textContent = msg;
        el.style.display = 'block';
    }

    hideOverlayMessage() {
        const el = document.getElementById('data-message');
        if (el) el.style.display = 'none';
    }

    hideLoading() {
        const el = document.getElementById('loading-message');
        if (el) el.style.display = 'none';
    }

    showError(msg) {
        this.hideLoading();

        const el = document.getElementById('error-message');
        if (!el) return;

        el.textContent = msg;
        el.style.display = 'block';
    }

    getMedian(values) {
        if (!values || values.length === 0) return 0;

        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);

        return sorted.length % 2 !== 0
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    formatCOP(val) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(this.safeNumber(val));
    }

    initDisclaimer() {
        const overlay = document.getElementById('disclaimer-overlay');
        if (!overlay) return;

        const acceptBtn = document.getElementById('disclaimer-accept-btn');
        const doNotShowCheckbox = document.getElementById('disclaimer-do-not-show');

        let accepted = false;

        try {
            accepted = localStorage.getItem('disclaimerAccepted') === 'true';
        } catch (e) {
            accepted = false;
        }

        if (!accepted) {
            overlay.classList.add('active');
        }

        if (acceptBtn) {
            acceptBtn.addEventListener('click', () => {
                if (doNotShowCheckbox && doNotShowCheckbox.checked) {
                    try {
                        localStorage.setItem('disclaimerAccepted', 'true');
                    } catch (e) {
                        console.warn('No se pudo guardar la preferencia del disclaimer.', e);
                    }
                }

                overlay.classList.remove('active');
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new GeoVisor();
});
