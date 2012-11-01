(function(window){
    var speed = 30700;
    var size = 737280;
    var seekTime = 2.4;
    var tracks = 80, sectors = 18;

    var sectorSize = size / (tracks * sectors);
    var ioTime = (1 / speed) * sectorSize * 1000;

    var states = {
        STATE_NO_MEDIA: 0x0000,
        STATE_READY: 0x0001,
        STATE_READY_WP: 0x0002,
        STATE_BUSY: 0x0003
    };

    var errors = {
        ERROR_NONE: 0x0000,
        ERROR_BUSY: 0x0001,
        ERROR_NO_MEDIA: 0x0002,
        ERROR_PROTECTED: 0x0003,
        ERROR_EJECT: 0x0004,
        ERROR_BAD_SECTOR: 0x0005,
        ERROR_BROKEN: 0xffff
    };

    function getTrack(sector) { return Math.floor(sector / sectors); }

    function M35FD(container) {
        this.id = 0x4fd524c5;
        this.version = 0x000b;
        this.manufacturer = 0x1eb37e91;

        this.disk = null;

        this.reset();
    }
    
    M35FD.prototype.onConnect = function(cpu) {
        this.cpu = cpu;
    };
    
    M35FD.prototype.onInterrupt = function(callback) {
        switch(this.cpu.mem.a) {
            case 0: this.poll(); break;
            case 1: this.interruptMessage = this.cpu.mem.x; break;
            case 2: this.read(this.cpu.mem.x, this.cpu.mem.y); break;
            case 3: this.write(this.cpu.mem.x, this.cpu.mem.y); break;
        }
        callback();
    };

    M35FD.prototype.poll = function() {
        if(!this.disk) this.cpu.mem.b = states.STATE_NO_MEDIA;
        else if(!this.busy && !this.disk.writeProtected) this.cpu.mem.b = states.STATE_READY;
        else if(!this.busy && this.disk.writeProtected) this.cpu.mem.b = states.STATE_READY_WP;
        else if(this.busy) this.cpu.mem.b = states.STATE_BUSY;

        this.cpu.mem.c = this.lastError;
        this.lastError = errors.ERROR_NONE;
    };
    
    M35FD.prototype.read = function(sector, address) {
        if(this.busy) this.error(errors.ERROR_BUSY, 0);
        else if(!this.disk) this.error(errors.ERROR_NO_MEDIA, 0);
        else {
            this.busy = true;
            this.cpu.mem.b = 1;

            setTimeout(function() {
                this.busy = false;
                this.track = getTrack(sector);
                this.cpu.mem.splice.apply(this.cpu.mem, [address, sectorSize].concat(this.disk.get(sector)));
                this.interrupt();
            }.bind(this), this.getSeekTime(sector) + ioTime);
        }
    };
    
    M35FD.prototype.write = function(sector, address) {
        if(this.busy) this.error(errors.ERROR_BUSY, 0);
        else if(!this.disk) this.error(errors.ERROR_NO_MEDIA, 0);
        else if(this.disk.writeProtected) this.error(errors.ERROR_PROTECTED, 0);
        else {
            this.busy = true;
            this.cpu.mem.b = 1;

            setTimeout(function() {
                this.busy = false;
                this.track = getTrack(sector);
                this.disk.set(sector, this.cpu.mem.slice(address, address + sectorSize));
                this.interrupt();
            }.bind(this), this.getSeekTime(sector) + ioTime);
        }
    };
    
    M35FD.prototype.insert = function(disk) {
        this.disk = disk;
        this.interrupt();
    };
    
    M35FD.prototype.eject = function() {
        var disk = this.disk;
        this.insert(null);

        if(this.busy) {
            this.error(errors.ERROR_EJECT);
        }

        return disk;
    };
    
    M35FD.prototype.interrupt = function() {
        if(this.interrupt && this.cpu) this.cpu.interrupt(this.interrupt);
    };
    
    M35FD.prototype.error = function(error, b) {
        var changed = false;
        if(error !== this.lastError) changed = true;

        if(typeof b !== 'undefined') this.cpu.mem.b = b;

        this.lastError = error;
        if(changed) this.interrupt();
    };
    
    M35FD.prototype.getSeekTime = function(sector) {
        return Math.abs(this.track - getTrack(sector)) * seekTime;
    };

    M35FD.prototype.reset = function() {
        this.busy = false;
        this.lastError = errors.ERROR_NONE;
        this.interruptMessage = 0;

        this.track = 0;
    };

    window.M35FD = M35FD;
})(window);
