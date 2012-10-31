(function(window) {
    var keyMap = {
        8: 0x10,
        13: 0x11,
        45: 0x12,
        46: 0x13,
        38: 0x80,
        40: 0x81,
        37: 0x82,
        39: 0x83,
        16: 0x90,
        17: 0x91
    };

    var pressListeners = [
        0x10,
        0x11,
        0x12,
        0x13
    ];

    function Keyboard(container) {
        this.id = 0x30cf7406;
        this.version = 1;
        this.manufacturer = 0;

        this.buffer = [];
        this.keysDown = [];
        this.keyInterrupts = 0;

        this.pressLoop = this.pressLoop.bind(this);
    }
    
    Keyboard.prototype.onConnect = function(cpu) {
        this.cpu = cpu;
    
        $(document).keydown(function(e) {
            if(this.cpu.running && e.target.nodeName !== 'INPUT' && e.target.nodeName !== 'TEXTAREA') {
                var key = keyMap[e.which] || e.which;
                this.keysDown[key] = Date.now();
                
                if(pressListeners.indexOf(key) !== -1) this.buffer.push(key);
                this.keyEvent(key);
                
                if(e.which >= 37 && e.which <= 40 || e.which === 8) e.preventDefault();
            }
        }.bind(this));
        
        $(document).keyup(function(e) {
            if(this.cpu.running && e.target.nodeName !== 'INPUT' && e.target.nodeName !== 'TEXTAREA') {
                var key = keyMap[e.which] || e.which;
                this.keysDown[key] = 0;
                
                this.keyEvent(key);
            }
        }.bind(this));
        
        $(document).keypress(function(e) {
            if(this.cpu.running && e.target.nodeName !== 'INPUT' && e.target.nodeName !== 'TEXTAREA') {
                var key = keyMap[e.which] || e.which;
                this.buffer.push(key);
                this.keyEvent(key);
                e.preventDefault();
            }
        }.bind(this));

        this.pressLoop();
    };
    
    Keyboard.prototype.onInterrupt = function(callback) {
        switch(this.cpu.mem.a) {
            case 0:
                this.buffer = [];
                break;
            
            case 1:
                var k = this.buffer.shift() || 0;
                this.cpu.set('c',  k);
                break;
                
            case 2:
                this.cpu.set('c', Number(this.keysDown[this.cpu.mem.b] !== 0));
                break;
                
            case 3:
                this.keyInterrupts = this.cpu.mem.b;
                break;
        }
        callback();
    };

    Keyboard.prototype.keyEvent = function(key) {
        if(this.keyInterrupts) {
            this.cpu.interrupt(keyInterrupts);
        }
    };

    Keyboard.prototype.pressLoop = function() {
        if(this.cpu.running) {
            var now = Date.now();
            for(var i = 0; i < pressListeners.length; i++) {
                if(this.keysDown[pressListeners[i]] && now - this.keysDown[pressListeners[i]] > 500) this.buffer.push(pressListeners[i]);
            }
        }
        setTimeout(this.pressLoop, 10);
    };

    window.Keyboard = Keyboard;
})(window);
