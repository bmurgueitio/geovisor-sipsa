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

const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

class GeoVisor {
    constructor() {
        this.data = null;
        this.map = null;
        this.popup = null;
        this.isPopupFixed = false;
        this.mapReady = false;
        this.dropdownGrupo = null;
        this.dropdownSubgrupo = null;
        this.dropdownProducto = null;
        this.currentProductoPlazas = [];
        this.visiblePlazas = [];
        this.filterPanel = null;
        this.dropdowns = [];
        this.init();
    }

    async init() {
        try {
            const response = await fetch('data/data.json');
            if (!response.ok) throw new Error('Error al cargar JSON');
            this.data = await response.json();
            this.updateSubtitle(null);
            this.initMap();
            this.initDropdowns();
            this.initFilterButton();
            this.initInfoButton();
            this.hideLoading();
        } catch (err) {
            console.error(err);
            this.showError("No se pudieron cargar los datos. Verifique que data/data.json exista.");
        }
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
                layers: [{ id: 'carto-dark', type: 'raster', source: 'carto-dark' }]
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
                data: { type: 'FeatureCollection', features: [] }
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
        });
    }

    setupMapInteractions() {
        const popupOptions = { closeButton: true, closeOnClick: false, maxWidth: '250px' };
        this.popup = new maplibregl.Popup(popupOptions);
        
        this.map.on('mouseenter', 'plazas-layer', (e) => {
            if (this.isPopupFixed) return;
            this.map.getCanvas().style.cursor = 'pointer';
            if (e.features.length > 0) this.showPopup(e.features[0]);
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
            const features = this.map.queryRenderedFeatures(e.point, { layers: ['plazas-layer'] });
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
        if (variacion < -10) return '↓↓';
        if (variacion >= -10 && variacion < -6) return '↓';
        if (variacion >= -6 && variacion < -2) return '↘';
        if (variacion >= -2 && variacion <= 2) return '→';
        if (variacion > 2 && variacion <= 6) return '↗';
        if (variacion > 6 && variacion <= 10) return '↑';
        if (variacion > 10) return '↑↑';
        return '→';
    }

    showPopup(feature) {
        const p = feature.properties;
        const coords = JSON.parse(p.coordinates);
        const varClass = p.variacion_pct >= 0 ? 'var-up' : 'var-down';
        const varSign = p.variacion_pct >= 0 ? '+' : '';
        const arrow = this.getArrow(p.variacion_pct);
        const html = `
            <div class="popup-title">${p.nombre_fuente}</div>
            <div style="font-size: 11px; color: #666; margin-bottom: 6px;">${p.ciudad}, ${p.departamento}</div>
            <div class="popup-row"><span>Precio Reciente:</span> <b>${this.formatCOP(p.precio_reciente)}</b></div>
            <div class="popup-row"><span>Precio Anterior:</span> <span>${this.formatCOP(p.precio_anterior)}</span></div>
            <div class="popup-row"><span>Variación:</span> <span class="${varClass}">${arrow} ${varSign}${p.variacion_pct}%</span></div>
        `;
        this.popup.setLngLat(coords).setHTML(html).addTo(this.map);
    }

    initDropdowns() {
        const grupos = this.data.grupos.map(g => g.nombre);
        
        const onOpen = (current) => {
            this.dropdowns.forEach(d => {
                if (d !== current) d.close();
            });
        };
        
        this.dropdownGrupo = new SearchableDropdown(
            'dropdown-grupo', 
            'Seleccione Grupo', 
            (val) => this.onGrupoChange(val),
            () => onOpen(this.dropdownGrupo)
        );
        this.dropdownGrupo.setOptions(grupos);
        
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
        
        this.dropdowns = [this.dropdownGrupo, this.dropdownSubgrupo, this.dropdownProducto];
    }

    onGrupoChange(grupo) {
        this.dropdownSubgrupo.resetSelection();
        this.dropdownProducto.resetSelection();
        this.clearMap();
        this.hideDashboard();
        this.updateSubtitle(null);
        
        const gData = this.data.grupos.find(g => g.nombre === grupo);
        if (gData) {
            const subgrupos = gData.subgrupos.map(s => s.nombre);
            this.dropdownSubgrupo.setOptions(subgrupos);
        } else {
            this.dropdownSubgrupo.setOptions([]);
        }
    }

    onSubgrupoChange(subgrupo) {
        this.dropdownProducto.resetSelection();
        this.clearMap();
        this.hideDashboard();
        this.updateSubtitle(null);
        
        const gData = this.data.grupos.find(g => g.nombre === this.dropdownGrupo.selectedValue);
        if (gData) {
            const sData = gData.subgrupos.find(s => s.nombre === subgrupo);
            if (sData) {
                const productos = sData.productos.map(p => p.nombre);
                this.dropdownProducto.setOptions(productos);
            } else {
                this.dropdownProducto.setOptions([]);
            }
        } else {
            this.dropdownProducto.setOptions([]);
        }
    }

    onProductoChange(productoNombre) {
        if (!productoNombre) {
            this.clearMap();
            this.hideDashboard();
            this.updateSubtitle(null);
            this.closeFilterPanel();
            return;
        }
        
        const gData = this.data.grupos.find(g => g.nombre === this.dropdownGrupo.selectedValue);
        const sData = gData?.subgrupos.find(s => s.nombre === this.dropdownSubgrupo.selectedValue);
        const pData = sData?.productos.find(p => p.nombre === productoNombre);
        
        if (pData) {
            this.currentProductoPlazas = pData.plazas;
            this.visiblePlazas = [...this.currentProductoPlazas];
            this.buildFilterPanel(this.currentProductoPlazas);
            this.renderPlazas(this.visiblePlazas);
            this.renderDashboard(this.visiblePlazas);
            this.updateSubtitle(pData.nombre);
        } else {
            this.currentProductoPlazas = [];
            this.visiblePlazas = [];
            this.clearMap();
            this.hideDashboard();
            this.updateSubtitle(null);
        }
    }

    renderDashboard(plazas) {
        const dashboard = document.getElementById('dashboard');
        if (!plazas || plazas.length === 0) {
            dashboard.style.display = 'none';
            return;
        }
        
        dashboard.style.display = 'flex';
        
        // Precio promedio
        const avgPrecio = plazas.reduce((sum, p) => sum + p.precio_reciente, 0) / plazas.length;
        document.getElementById('metric-avg-value').textContent = this.formatCOP(avgPrecio);
        
        // Tendencia semanal (promedio de variación)
        const avgVariacion = plazas.reduce((sum, p) => sum + p.variacion_pct, 0) / plazas.length;
        const arrow = this.getArrow(avgVariacion);
        const sign = avgVariacion >= 0 ? '+' : '';
        const trendColor = avgVariacion >= 0 ? '#1a9641' : '#b2182b';
        document.getElementById('metric-trend-value').innerHTML = 
            `<span style="color: ${trendColor};">${arrow} ${sign}${avgVariacion.toFixed(1)}%</span>`;
        
        // Mayor subida
        const maxSubida = plazas.reduce((max, p) => p.variacion_pct > max.variacion_pct ? p : max, plazas[0]);
        document.getElementById('metric-max-up-value').innerHTML = 
            `<div style="font-size: 13px;">${maxSubida.nombre_fuente}</div>
             <div style="color: #1a9641; font-size: 16px;">↑ +${maxSubida.variacion_pct}%</div>`;
        
        // Mayor bajada
        const maxBajada = plazas.reduce((min, p) => p.variacion_pct < min.variacion_pct ? p : min, plazas[0]);
        document.getElementById('metric-max-down-value').innerHTML = 
            `<div style="font-size: 13px;">${maxBajada.nombre_fuente}</div>
             <div style="color: #b2182b; font-size: 16px;">↓ ${maxBajada.variacion_pct}%</div>`;
        
        // Plaza más barata
        const masBarata = plazas.reduce((min, p) => p.precio_reciente < min.precio_reciente ? p : min, plazas[0]);
        document.getElementById('metric-min-price-value').innerHTML = 
            `<div style="font-size: 13px;">${masBarata.nombre_fuente}</div>
             <div style="color: #3498db; font-size: 16px;">${this.formatCOP(masBarata.precio_reciente)}</div>`;
        
        // Plaza más cara
        const masCara = plazas.reduce((max, p) => p.precio_reciente > max.precio_reciente ? p : max, plazas[0]);
        document.getElementById('metric-max-price-value').innerHTML = 
            `<div style="font-size: 13px;">${masCara.nombre_fuente}</div>
             <div style="color: #e67e22; font-size: 16px;">${this.formatCOP(masCara.precio_reciente)}</div>`;
    }

    hideDashboard() {
        const dashboard = document.getElementById('dashboard');
        if (dashboard) dashboard.style.display = 'none';
    }

    buildFilterPanel(plazas) {
        const container = document.getElementById('filter-checkboxes');
        container.innerHTML = '';
        
        plazas.forEach((plaza, index) => {
            const item = document.createElement('div');
            item.className = 'filter-checkbox-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `plaza-${index}`;
            checkbox.checked = true;
            checkbox.value = plaza.nombre_fuente;
            
            const label = document.createElement('label');
            label.htmlFor = `plaza-${index}`;
            label.textContent = plaza.nombre_fuente;
            
            checkbox.addEventListener('change', () => this.applyFilter());
            
            item.appendChild(checkbox);
            item.appendChild(label);
            container.appendChild(item);
        });
    }

    applyFilter() {
        const checkboxes = document.querySelectorAll('#filter-checkboxes input[type="checkbox"]');
        const selectedPlazas = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
        
        this.visiblePlazas = this.currentProductoPlazas.filter(p => 
            selectedPlazas.includes(p.nombre_fuente)
        );
        
        if (this.visiblePlazas.length === 0) {
            this.showOverlayMessage("No hay plazas seleccionadas");
            this.hideDashboard();
        } else {
            this.hideOverlayMessage();
            this.renderPlazas(this.visiblePlazas);
            this.renderDashboard(this.visiblePlazas);
        }
    }

    initFilterButton() {
        const filterBtn = document.getElementById('filter-btn');
        const filterPanel = document.getElementById('filter-panel');
        const closeBtn = document.getElementById('filter-close-btn');
        const selectAllBtn = document.getElementById('select-all-btn');
        const deselectAllBtn = document.getElementById('deselect-all-btn');
        
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFilterPanel();
        });
        
        closeBtn.addEventListener('click', () => {
            this.closeFilterPanel();
        });
        
        selectAllBtn.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('#filter-checkboxes input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = true);
            this.applyFilter();
        });
        
        deselectAllBtn.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('#filter-checkboxes input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = false);
            this.applyFilter();
        });
        
        document.addEventListener('click', (e) => {
            if (filterPanel.style.display !== 'none' && 
                !filterPanel.contains(e.target) && 
                !filterBtn.contains(e.target)) {
                this.closeFilterPanel();
            }
        });
    }

    toggleFilterPanel() {
        const panel = document.getElementById('filter-panel');
        panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    }

    closeFilterPanel() {
        const panel = document.getElementById('filter-panel');
        panel.style.display = 'none';
    }

    initInfoButton() {
        const infoBtn = document.getElementById('info-btn');
        const infoTooltip = document.getElementById('info-tooltip');
        
        infoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            infoTooltip.classList.toggle('active');
        });
        
        document.addEventListener('click', (e) => {
            if (!infoTooltip.contains(e.target) && !infoBtn.contains(e.target)) {
                infoTooltip.classList.remove('active');
            }
        });
        
        // Hover en escritorio
        if (window.innerWidth > 768) {
            infoBtn.addEventListener('mouseenter', () => {
                infoTooltip.classList.add('active');
            });
            
            const container = document.getElementById('info-container');
            container.addEventListener('mouseleave', () => {
                infoTooltip.classList.remove('active');
            });
        }
    }

    renderPlazas(plazas) {
        if (!this.mapReady || !this.map.getSource('plazas')) {
            return;
        }
        
        if (plazas.length === 0) {
            this.showOverlayMessage("No hay datos disponibles para este producto");
            return;
        }
        
        this.hideOverlayMessage();
        const precios = plazas.map(p => p.precio_reciente);
        const minP = Math.min(...precios);
        const maxP = Math.max(...precios);
        const medP = this.getMedian(precios);
        
        const features = plazas.map(p => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.longitud, p.latitud] },
            properties: {
                ...p,
                coordinates: JSON.stringify([p.longitud, p.latitud])
            }
        }));
        
        const geojson = { type: 'FeatureCollection', features };
        this.map.getSource('plazas').setData(geojson);
        
        const rMin = 6, rMax = 20;
        this.map.setPaintProperty('plazas-layer', 'circle-radius', [
            'interpolate', ['linear'], ['get', 'precio_reciente'],
            minP, rMin,
            maxP, rMax
        ]);
        
        this.map.setPaintProperty('plazas-layer', 'circle-color', [
            'match', ['get', 'categoria'],
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
            if (maxP === minP) return (rMin + rMax) / 2 * 2;
            const r = rMin + (val - minP) * (rMax - rMin) / (maxP - minP);
            return r * 2;
        };
        
        const sizeMax = document.getElementById('size-max');
        const sizeMed = document.getElementById('size-med');
        const sizeMin = document.getElementById('size-min');
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
            this.map.getSource('plazas').setData({ type: 'FeatureCollection', features: [] });
        }
        this.hideOverlayMessage();
    }

    showOverlayMessage(msg) {
        let el = document.getElementById('data-message');
        if (!el) {
            el = document.createElement('div');
            el.id = 'data-message';
            el.className = 'map-overlay';
            document.getElementById('map-container').appendChild(el);
        }
        el.textContent = msg;
        el.style.display = 'block';
    }

    hideOverlayMessage() {
        const el = document.getElementById('data-message');
        if (el) el.style.display = 'none';
    }

    hideLoading() {
        document.getElementById('loading-message').style.display = 'none';
    }

    showError(msg) {
        this.hideLoading();
        const el = document.getElementById('error-message');
        el.textContent = msg;
        el.style.display = 'block';
    }

    getMedian(values) {
        if (values.length === 0) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    formatCOP(val) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(val);
    }
}

document.addEventListener('DOMContentLoaded', () => new GeoVisor());
