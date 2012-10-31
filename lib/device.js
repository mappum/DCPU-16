(function(window){    
    function device(container) {
        this.id = 0;
        this.version = 0;
        this.manufacturer = 0;
    }
    
    device.prototype.onConnect = function(cpu) {
        this.cpu = cpu;
    };
    
    device.prototype.onInterrupt = function(callback) {
        switch(this.cpu.get('a')) {

        }
        callback();
    };

    window.device = device;
})(window);
