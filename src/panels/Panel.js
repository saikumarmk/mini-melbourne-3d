/**
 * Base Panel class for creating UI panels
 * Adapted from Mini Tokyo 3D
 */
export default class Panel {
    constructor(options = {}) {
        this._options = {
            modal: false,
            className: '',
            ...options
        };
    }

    /**
     * Sets the panel's title
     * @param {string} title - The title HTML
     * @returns {Panel} Returns itself to allow for method chaining
     */
    setTitle(title) {
        this._title = title;
        if (this._container) {
            this._container.querySelector('#panel-title').innerHTML = title;
        }
        return this;
    }

    /**
     * Sets the panel's content
     * @param {string} html - A string representing HTML content for the panel
     * @returns {Panel} Returns itself to allow for method chaining
     */
    setHTML(html) {
        this._html = html;
        if (this._container) {
            this._container.querySelector('#panel-content').innerHTML = html;
        }
        return this;
    }

    /**
     * Adds the panel to the map
     * @param {MelbourneMap} map - The map to add the panel to
     * @returns {Panel} Returns itself to allow for method chaining
     */
    addTo(map) {
        this._map = map;
        const options = this._options;

        // Create background overlay for modal panels
        if (options.modal) {
            this._background = document.createElement('div');
            this._background.className = 'modal-panel-background closed';
            this._background.addEventListener('click', () => {
                this.remove();
            });
            map.container.appendChild(this._background);
        }

        // Create panel container
        this._container = document.createElement('div');
        this._container.className = `panel closed ${options.className}`;
        this._container.innerHTML = `
            <div id="panel-header">
                <div id="panel-title"></div>
                <div id="panel-button-group" class="panel-button-group">
                    <div id="panel-button" class="${options.modal ? 'close-button' : 'slide-button'}"></div>
                </div>
            </div>
            <div id="panel-body">
                <div id="panel-content"></div>
            </div>
        `;
        map.container.appendChild(this._container);

        // Set title and content if already defined
        if (this._title) {
            this.setTitle(this._title);
        }
        if (this._html) {
            this.setHTML(this._html);
        }

        // Add event handlers
        if (options.modal) {
            this._container.querySelector('#panel-button').addEventListener('click', () => {
                this.remove();
            });
        } else {
            this._container.querySelector('#panel-header').addEventListener('click', () => {
                const classList = this._container.classList;
                if (classList.contains('collapsed')) {
                    classList.remove('collapsed');
                } else {
                    classList.add('collapsed');
                }
            });
            this._container.querySelector('#panel-header').style.cursor = 'pointer';
        }

        // Animate panel opening
        requestAnimationFrame(() => {
            if (options.modal && this._background) {
                this._background.classList.remove('closed');
            }
            this._container.classList.remove('closed');
        });

        return this;
    }

    /**
     * Removes the panel from the map
     * @returns {Panel} Returns itself to allow for method chaining
     */
    remove() {
        const options = this._options;

        if (options.modal && this._background) {
            this._background.classList.add('closed');
        }
        if (this._container) {
            this._container.classList.add('closed');
        }

        setTimeout(() => {
            if (options.modal && this._background) {
                this._background.remove();
                delete this._background;
            }
            if (this._container) {
                this._container.remove();
                delete this._container;
            }
            delete this._map;
        }, 300);

        return this;
    }

    /**
     * Checks if panel is open
     * @returns {boolean} True if the panel is open
     */
    isOpen() {
        return !!this._map;
    }
}

