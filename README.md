# 🌾 Geovisor de Precios Agrícolas - Colombia

Herramienta visual estática para explorar la variación semanal de precios de productos agrícolas en diferentes plazas de mercado de Colombia. El geovisor consume datos preprocesados en formato JSON y los representa espacialmente usando Maplibre GL JS.

## 🚀 Instrucciones de Uso Local

### 1. Generación de Datos (ETL)
Asegúrese de tener el archivo `sipsa_data.db` en la raíz del proyecto.
Ejecute el script de Python (no requiere dependencias externas):
```bash
python generate_json.py
