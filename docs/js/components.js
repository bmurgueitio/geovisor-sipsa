export class SearchableDropdown {
    constructor(containerId, placeholder, onSelect, onOpenCallback = null) {
        this.container = document.getElementById(containerId);
        this.placeholder = placeholder;
        this.onSelect = onSelect;
        this.onOpenCallback = onOpenCallback;
        this.options = [];
        this.selectedValue = null;
        this.isOpen = false;
        this.build();
        this.bindEvents();
    }

    build() {
        this.container.classList.add('searchable-dropdown');
        this.container.innerHTML = `
            <div class="dropdown-header">
                <span class="dropdown-selected-text">${this.placeholder}</span>
                <span class="dropdown-caret">▼</span>
            </div>
            <div class="dropdown-menu">
                <div class="dropdown-search-wrapper">
                    <input type="text" class="dropdown-search-input" placeholder="Buscar...">
                </div>
                <ul class="dropdown-options"></ul>
            </div>
        `;
        this.header = this.container.querySelector('.dropdown-header');
        this.selectedText = this.container.querySelector('.dropdown-selected-text');
        this.menu = this.container.querySelector('.dropdown-menu');
        this.searchInput = this.container.querySelector('.dropdown-search-input');
        this.optionsList = this.container.querySelector('.dropdown-options');
    }

    bindEvents() {
        this.header.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });
        this.searchInput.addEventListener('input', (e) => {
            this.filterOptions(e.target.value);
        });
        this.searchInput.addEventListener('click', (e) => e.stopPropagation());
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.container.contains(e.target)) {
                this.close();
            }
        });
    }

    setOptions(options) {
        this.options = options;
        this.filterOptions('');
    }

    filterOptions(query) {
        this.optionsList.innerHTML = '';
        const q = query.toLowerCase().trim();
        const filtered = this.options.filter(opt => 
            opt.toLowerCase().includes(q)
        );
        if (filtered.length === 0) {
            const li = document.createElement('li');
            li.textContent = "Sin resultados";
            li.style.color = "#999";
            li.style.cursor = "default";
            this.optionsList.appendChild(li);
            return;
        }
        filtered.forEach(opt => {
            const li = document.createElement('li');
            li.textContent = opt;
            if (opt === this.selectedValue) li.classList.add('selected');
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                this.select(opt);
            });
            this.optionsList.appendChild(li);
        });
    }

    select(value) {
        this.selectedValue = value;
        this.selectedText.textContent = value;
        this.close();
        this.searchInput.value = '';
        this.filterOptions('');
        if (this.onSelect) this.onSelect(value);
    }

    resetSelection() {
        this.selectedValue = null;
        this.selectedText.textContent = this.placeholder;
    }

    toggle() { 
        this.isOpen ? this.close() : this.open(); 
    }

    open() {
        if (this.onOpenCallback) this.onOpenCallback();
        this.isOpen = true;
        this.container.classList.add('open');
        setTimeout(() => this.searchInput.focus(), 10);
    }

    close() {
        this.isOpen = false;
        this.container.classList.remove('open');
        this.searchInput.value = '';
        this.filterOptions('');
    }
}
