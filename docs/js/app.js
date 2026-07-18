import { SearchableDropdown } from './components.js';

const colores = {
    '< -10%': '#b2182b',
    '-10% a -6%': '#ef8a62',
    '-6% a -2%': '#fddbc7',
    '-2% a 2%': '#fdffea',
    '2% a 6%': '#d9f0d3',
    '6% a 10%': '#a6d96a',
    '> 10%': '#1a9641'
};

class GeoVisor {
    constructor() {
        this.data = null;
        this.map = null;
        this.popup = null;
        this.isPopupFixed = false;

        this.dropdownGrupo = null;
        this.dropdownSubgrupo = null;
        this.dropdownProducto = null;

        this.currentProductoPlazas = [];

        this.init();
    }

    async init() {
        try {
            const response = await fetch('data/data.json');
            if (!response.ok) throw new Error('Error al cargar JSON');
            this.data = await response.json();
            
            this.initMap();
            this.initDropdowns();
            this.hideLoading();
        } catch (err) {
            console.error(err);
            this.showError("No se pudieron cargar los datos. Verifique que data/data.json exista.");
        }
    }

    initMap() {
        this.map = new maplibregl.Map({
            container: 'map',
            style: {
                version: 8,
                sources: {
                    'carto-positron': {
                        type: 'raster',
                        tiles: [
                            'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
                            'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
                            'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
                            'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png'
                        ],
                        tileSize: 256
                    }
                },
                layers: [{ id: 'carto-positron', type: 'raster', source: 'carto-positron' }]
            },
            center: [-74.0, 4.5],
            zoom: 5
        });

        this.map.addControl(new maplibregl.NavigationControl(), 'top-left');

        this.map.on('load', () => {
            this.map.addSource('plazas', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });

            this.map.addLayer({
                id: 'plazas-layer',
                type: 'circle',
                source: 'plazas',
                paint: {
                    'circle-radius': 8, // Se actualizará dinámicamente
                    'circle-color': '#ccc',
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

    showPopup(feature) {
        const p = feature.properties;
        const coords = JSON.parse(p.coordinates);
        
        const varClass = p.variacion_pct >= 0 ? 'var-up' : 'var-down';
        const varSign = p.variacion_pct >= 0 ? '+' : '';

        const html = `
            <div class="popup-title">${p.nombre_fuente}</div>
            <div style="font-size: 11px; color: #666; margin-bottom: 6px;">${p.ciudad}, ${p.departamento}</div>
            <div class="popup-row"><span>Precio Reciente:</span> <b>${this.formatCOP(p.precio_reciente)}</b></div>
            <div class="popup-row"><span>Precio Anterior:</span> <span>${this.formatCOP(p.precio_anterior)}</span></div>
            <div class="popup-row"><span>Variación:</span> <span class="${varClass}">${varSign}${p.variacion_pct}%</span></div>
        `;

        this.popup.setLngLat(coords).setHTML(html).addTo(this.map);
    }

    initDropdowns() {
        const grupos = this.data.grupos.map(g => g.nombre);
        
        this.dropdownGrupo = new SearchableDropdown('dropdown-grupo', 'Seleccione Grupo', (val) => {
            this.onGrupoChange(val);
        });
        this.dropdownGrupo.setOptions(grupos);

        this.dropdownSubgrupo = new SearchableDropdown('dropdown-subgrupo', 'Seleccione Subgrupo', (val) => {
            this.onSubgrupoChange(val);
        });

        this.dropdownProducto = new SearchableDropdown('dropdown-producto', 'Seleccione Producto', (val) => {
            this.onProductoChange(val);
        });

        if (grupos.length > 0) this.dropdownGrupo.select(grupos[0]);
    }

    onGrupoChange(grupo) {
        this.dropdownSubgrupo.resetSelection();
        this.dropdownProducto.resetSelection();
        this.clearMap();

        const gData = this.data.grupos.find(g => g.nombre === grupo);
        if (gData) {
            const subgrupos = gData.subgrupos.map(s => s.nombre);
            this.dropdownSubgrupo.setOptions(subgrupos);
            if (subgrupos.length > 0) this.dropdownSubgrupo.select(subgrupos[0]);
        }
    }

    onSubgrupoChange(subgrupo) {
        this.dropdownProducto.resetSelection();
        this.clearMap();

        const gData = this.data.grupos.find(g => g.nombre === this.dropdownGrupo.selectedValue);
        if (gData) {
            const sData = gData.subgrupos.find(s => s.nombre === subgrupo);
            if (sData) {
                const productos = sData.productos.map(p => p.nombre);
                this.dropdownProducto.setOptions(productos);
                if (productos.length > 0) this.dropdownProducto.select(productos[0]);
            }
        }
    }

    onProductoChange(productoNombre) {
        const gData = this.data.grupos.find(g => g.nombre === this.dropdownGrupo.selectedValue);
        const sData = gData?.subgrupos.find(s => s.nombre === this.dropdownSubgrupo.selectedValue);
        const pData = sData?.productos.find(p => p.nombre === productoNombre);

        if (pData) {
            this.currentProductoPlazas = pData.plazas;
            this.renderPlazas(pData.plazas);
        } else {
            this.currentProductoPlazas = [];
            this.clearMap();
        }
    }

    renderPlazas(plazas) {
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

        const rMin = 8, rMax = 30;
        const diff = maxP - minP || 1;

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
            '#ccc'
        ]);

        this.updateSizeLegend(minP, medP, maxP, rMin, rMax);
    }

    updateSizeLegend(minP, medP, maxP, rMin, rMax) {
        const calcSize = (val) => {
            if (maxP === minP) return (rMin + rMax) / 2 * 2;
            const r = rMin + (val - minP) * (rMax - rMin) / (maxP - minP);
            return r * 2; // Diámetro en px
        };

        const sizeMax = document.getElementById('size-max');
        const sizeMed = document.getElementById('size-med');
        const sizeMin = document.getElementById('size-min');

        const dMax = calcSize(maxP);
        const dMed = calcSize(medP);
        const dMin = calcSize(minP);

        sizeMax.style.width = `${dMax}px`; sizeMax.style.height = `${dMax}px`;
        sizeMed.style.width = `${dMed}px`; sizeMed.style.height = `${dMed}px`;
        sizeMin.style.width = `${dMin}px`; sizeMin.style.height = `${dMin}px`;

        document.getElementById('val-max').textContent = this.formatCOP(maxP);
        document.getElementById('val-med').textContent = this.formatCOP(medP);
        document.getElementById('val-min').textContent = this.formatCOP(minP);
    }

    clearMap() {
        if (this.map.getSource('plazas')) {
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

    hideLoading() { document.getElementById('loading-message').style.display = 'none'; }
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
