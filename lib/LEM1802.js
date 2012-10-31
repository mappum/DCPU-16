(function(window){
    var charWidth = 4, charHeight = 8;
    var charScale = 3;
    var blinkInterval = 700;
    var cols = 32, rows = 12;
    var borderSize = 6;

    var defaultPalette = [
        0x000, 0x00a, 0x0a0, 0x0aa, 
        0xa00, 0xa0a, 0xa50, 0xaaa, 
        0x555, 0x55f, 0x5f5, 0x5ff, 
        0xf55, 0xf5f, 0xff5, 0xfff
    ];

    var defaultFont = [
        0xb79e, 0x388e, 0x722c, 0x75f4, 0x19bb, 0x7f8f, 0x85f9, 0xb158, 0x242e, 0x2400, 0x082a, 0x0800, 0x0008, 0x0000, 0x0808, 0x0808,
        0x00ff, 0x0000, 0x00f8, 0x0808, 0x08f8, 0x0000, 0x080f, 0x0000, 0x000f, 0x0808, 0x00ff, 0x0808, 0x08f8, 0x0808, 0x08ff, 0x0000,
        0x080f, 0x0808, 0x08ff, 0x0808, 0x6633, 0x99cc, 0x9933, 0x66cc, 0xfef8, 0xe080, 0x7f1f, 0x0701, 0x0107, 0x1f7f, 0x80e0, 0xf8fe,
        0x5500, 0xaa00, 0x55aa, 0x55aa, 0xffaa, 0xff55, 0x0f0f, 0x0f0f, 0xf0f0, 0xf0f0, 0x0000, 0xffff, 0xffff, 0x0000, 0xffff, 0xffff,
        0x0000, 0x0000, 0x005f, 0x0000, 0x0300, 0x0300, 0x3e14, 0x3e00, 0x266b, 0x3200, 0x611c, 0x4300, 0x3629, 0x7650, 0x0002, 0x0100,
        0x1c22, 0x4100, 0x4122, 0x1c00, 0x1408, 0x1400, 0x081c, 0x0800, 0x4020, 0x0000, 0x0808, 0x0800, 0x0040, 0x0000, 0x601c, 0x0300,
        0x3e49, 0x3e00, 0x427f, 0x4000, 0x6259, 0x4600, 0x2249, 0x3600, 0x0f08, 0x7f00, 0x2745, 0x3900, 0x3e49, 0x3200, 0x6119, 0x0700,
        0x3649, 0x3600, 0x2649, 0x3e00, 0x0024, 0x0000, 0x4024, 0x0000, 0x0814, 0x2200, 0x1414, 0x1400, 0x2214, 0x0800, 0x0259, 0x0600,
        0x3e59, 0x5e00, 0x7e09, 0x7e00, 0x7f49, 0x3600, 0x3e41, 0x2200, 0x7f41, 0x3e00, 0x7f49, 0x4100, 0x7f09, 0x0100, 0x3e41, 0x7a00,
        0x7f08, 0x7f00, 0x417f, 0x4100, 0x2040, 0x3f00, 0x7f08, 0x7700, 0x7f40, 0x4000, 0x7f06, 0x7f00, 0x7f01, 0x7e00, 0x3e41, 0x3e00,
        0x7f09, 0x0600, 0x3e61, 0x7e00, 0x7f09, 0x7600, 0x2649, 0x3200, 0x017f, 0x0100, 0x3f40, 0x7f00, 0x1f60, 0x1f00, 0x7f30, 0x7f00,
        0x7708, 0x7700, 0x0778, 0x0700, 0x7149, 0x4700, 0x007f, 0x4100, 0x031c, 0x6000, 0x417f, 0x0000, 0x0201, 0x0200, 0x8080, 0x8000,
        0x0001, 0x0200, 0x2454, 0x7800, 0x7f44, 0x3800, 0x3844, 0x2800, 0x3844, 0x7f00, 0x3854, 0x5800, 0x087e, 0x0900, 0x4854, 0x3c00,
        0x7f04, 0x7800, 0x047d, 0x0000, 0x2040, 0x3d00, 0x7f10, 0x6c00, 0x017f, 0x0000, 0x7c18, 0x7c00, 0x7c04, 0x7800, 0x3844, 0x3800,
        0x7c14, 0x0800, 0x0814, 0x7c00, 0x7c04, 0x0800, 0x4854, 0x2400, 0x043e, 0x4400, 0x3c40, 0x7c00, 0x1c60, 0x1c00, 0x7c30, 0x7c00, 
        0x6c10, 0x6c00, 0x4c50, 0x3c00, 0x6454, 0x4c00, 0x0836, 0x4100, 0x0077, 0x0000, 0x4136, 0x0800, 0x0201, 0x0201, 0x0205, 0x0200
    ];

    function LEM1802(canvas) {
        this.id = 0x7349f615;
        this.version = 0x1802;
        this.manufacturer = 0x1c6c8b36;

        if(typeof canvas === 'string') this.canvas = document.getElementById(canvas);
        else this.canvas = canvas;

        this.canvas.setAttribute('width', (charWidth * cols + borderSize * 2) * charScale);
        this.canvas.setAttribute('height', (charHeight * rows + borderSize * 2) * charScale);

        this.ctx = this.canvas.getContext('2d');
        
        this.blinkVisible = false;
        this.blinkCells = [];
        this.cellQueue = [];

        this.drawLoop = this.drawLoop.bind(this);
        this.blinkLoop = this.blinkLoop.bind(this);

        this._drawListeners = [];
    }

    LEM1802.prototype.onConnect = function(cpu) {
        this.cpu = cpu;
    
        for(var i = 0; i < rows; i++) {
            this.cellQueue.push([]);
            this.blinkCells.push([]);
        }

        this.screenRam = this.cpu.onSet(this.cpu.ramSize, cols * rows, function(key, val) {
            var row = Math.floor(key / cols),
                col = key % cols;
               
            this.queueChar(col, row);
               
            if(((val >> 7) & 1) === 1) this.blinkCells[row][col] = true;
            else this.blinkCells[row][col] = false;
        }.bind(this));
        
        this.fontRam = this.cpu.onSet(this.cpu.ramSize, 256, function(key, val) {
            if(this.screenRam.address < this.cpu.ramSize) {
                var value = Math.floor(key / 2);
                    
                for(var i = 0; i < this.screenRam.length; i++) {
                    if((this.cpu.get(this.screenRam.address + i) & 0x7f) === value) {
                        this.queueChar(i % cols, Math.floor(i / cols));
                    }
                }
            }
        }.bind(this));
        
        this.paletteRam = this.cpu.onSet(this.cpu.ramSize, 16, function(key, val) {
            if(this.screenRam.address < this.cpu.ramSize) {
                for(var i = 0; i < this.screenRam.length; i++) {
                    if(((this.cpu.get(this.screenRam.address + i) & 0xf00) >> 8) === key ||
                    ((this.cpu.get(this.screenRam.address + i) & 0xf000) >> 12) === key) {
                        this.queueChar(i % cols, Math.floor(i / cols));
                    }
                }
            }
        }.bind(this));

        this.drawLoop();
        this.blinkLoop();
    };

    LEM1802.prototype.getColor = function(val) {
        val &= 0xf;
        
        var color;
        if(typeof this.paletteRam !== 'undefined' &&
            this.paletteRam.address < this.cpu.ramSize) color = this.cpu.get(this.paletteRam.address + val);
        else color = defaultPalette[val];
        
        var r = ((color & 0xf00) >> 8) * 17;
        var g = ((color & 0xf0) >> 4) * 17;
        var b = (color & 0xf) * 17;
        
        return 'rgb(' + r +',' + g + ',' + b + ')';
    };

    LEM1802.prototype.onInterrupt = function(callback) {
        var i;

        switch(this.cpu.mem.a) {
            // MEM_MAP_SCREEN
            case 0:
                if(this.cpu.mem.b > 0) {
                    this.screenRam.address = this.cpu.mem.b;
                } else {
                    this.screenRam.address = this.cpu.ramSize;
                }
                this.drawScreen();
                break;
                
            // MEM_MAP_FONT
            case 1:
                if(this.cpu.mem.b > 0) {
                    this.fontRam.address = this.cpu.mem.b;
                } else {
                    this.fontRam.address = this.cpu.ramSize;
                }
                this.drawScreen();
                break;
                
            // MEM_MAP_PALETTE
            case 2:
                if(this.cpu.mem.b > 0) {
                    this.paletteRam.address = this.cpu.mem.b;
                } else {
                    this.paletteRam.address = this.cpu.ramSize;
                }
                this.drawScreen();
                break;
                
            // SET_BORDER_COLOR
            case 3:
                var width = (charWidth * cols + borderSize * 2) * charScale,
                    height = (charHeight * rows + borderSize * 2) * charScale;
                this.ctx.fillStyle = this.getColor(this.cpu.mem.b & 0xf);
                this.ctx.fillRect(0, 0, width, borderSize * charScale);
                this.ctx.fillRect(0, height - borderSize * charScale, width, borderSize * charScale);
                this.ctx.fillRect(0, 0, borderSize * charScale, height);
                this.ctx.fillRect(width - borderSize * charScale, 0, borderSize * charScale, height);
                break;
            
            // MEM_DUMP_FONT
            case 4:
                for(i = 0; i < defaultFont.length; i++) {
                    this.cpu.set(this.cpu.mem.b + i, defaultFont[i]);
                }
                this.cpu.cycle += 256;
                break;
                
            // MEM_DUMP_PALETTE
            case 5:
                for(i = 0; i < defaultPalette.length; i++) {
                    this.cpu.set(this.cpu.mem.b + i, defaultPalette[i]);
                }
                this.cpu.cycle += 16;
                break;
        }
        callback();
    };

    LEM1802.prototype.queueChar = function(x, y) {
        if(x < cols && y < rows) this.cellQueue[y][x] = true;
    };

    LEM1802.prototype.drawScreen = function() {
        for(var i = 0; i < rows; i++) {
            for(var j = 0; j < cols; j++) {
                this.queueChar(j, i);
            }
        }
    };

    LEM1802.prototype.drawChar = function(value, x, y) {
        var charValue = value & 0x7f,
            fg = this.getColor((value >> 12) & 0xf),
            bg = this.getColor((value >> 8) & 0xf),
            blink = ((value >> 7) & 1) === 1;

        var fontChar;
        if(this.fontRam.address < this.cpu.ramSize)
            fontChar = [this.cpu.get(this.fontRam.address+charValue * 2), this.cpu.get(this.fontRam.address+charValue * 2 + 1)];
        else fontChar = [defaultFont[charValue * 2], defaultFont[charValue * 2 + 1]];
        
        this.ctx.fillStyle = bg;
        this.ctx.fillRect((x * charWidth + borderSize) * charScale,
            (y * charHeight + borderSize) * charScale,
            charWidth * charScale, charHeight * charScale);
        
        if(!(blink && !this.blinkVisible)) {
            for(var i = 0; i < charWidth; i++) {
                var word = fontChar[(i >= 2) * 1];
                var hword = (word >> (!(i%2) * 8)) & 0xff;
    
                for(var j = 0; j < charHeight; j++) {
                    var pixel = (hword >> j) & 1;
                    
                    if(pixel) {
                        this.ctx.fillStyle = fg;
                        this.ctx.fillRect((x * charWidth + i + borderSize) * charScale,
                            (y * charHeight + j + borderSize) * charScale,
                            charScale, charScale);
                    }
                }
            }
        }
    };

    LEM1802.prototype.drawLoop = function() {
        var drew = false;
        if(this.screenRam.address < this.cpu.ramSize) {
            for(var i = 0; i < rows; i++) {
                for(var j = 0; j < cols; j++) {
                    var cell = this.cellQueue[i][j];
                    if(cell) {
                        this.drawChar(this.cpu.get(this.screenRam.address + (i * cols) + j), j, i);
                        this.cellQueue[i][j] = false;
                        drew = true;
                    }
                }
            }
        }

        if(drew) {
            for(var i = 0; i < this._drawListeners.length; i++) {
                this._drawListeners[i]();
            }
        }

        setTimeout(this.drawLoop, 1000 / 60);
    };

    LEM1802.prototype.blinkLoop = function() {
        if(this.cpu.running) this.blinkVisible = !this.blinkVisible;
        for(var i = 0; i < rows; i++) {
            for(var j = 0; j < cols; j++) {
                if(this.blinkCells[i][j]) {
                    this.queueChar(j, i);
                }
            }
        }

        setTimeout(this.blinkLoop, blinkInterval);
    };

    LEM1802.prototype.clear = function() {
        this.ctx.fillStyle = this.getColor(0);
        this.ctx.fillRect(0, 0, 500, 500);
    };

    LEM1802.loadDefaultFont = function(image) {
        var fontCanvas = document.createElement('canvas');
        var fontCtx = fontCanvas.getContext('2d');
        var fontImage = new Image();
        var font = [];

        fontImage.onload = function() {
            fontCtx.drawImage(fontImage, 0, 0);
            
            for(var i = 0; i < charWidth; i++) {
                for(var j = 0; j < 32; j++) {
                    var fontData = fontCtx.getImageData(j * charWidth, i * charHeight, charWidth, charHeight),
                        charId = (i * 32) + j;
                        
                    for(var k = 0; k < charWidth; k++) {
                        var col = 0;
                        for(var l = 0; l < charHeight; l++) {
                            var pixelId = l * charWidth + k;
                            col |= (((fontData.data[pixelId * charWidth + 1] > 128) * 1) << l);
                        }
                        font[(charId * 2) + Math.floor(k/2)] |= (col << (((k+1)%2) * charHeight));
                    }
                }
            }

            defaultFont = font;
        };
        fontImage.src = image;
    };  

    LEM1802.prototype.onDraw = function(listener) {
        this._drawListeners.push(listener);
    };

    LEM1802.prototype.offDraw = function(listener) {
        var index = this._drawListeners.indexOf(listener);
        if(index > -1) this._drawListeners = this._drawListeners.splice(index, 1);
    };

    window.LEM1802 = LEM1802;
})(window);
