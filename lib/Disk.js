(function(window) {
    var size = 737280;
    var tracks = 80, sectors = 18;

    var sectorSize = size / (tracks * sectors);

    function Disk(data, writeProtected) {
        this.writeProtected = writeProtected || false;
        this.data = [] || data;

        for(var i = 0; i < tracks; i++) {
            for(var j = 0; j < sectors; j++) {
                this.data[i * 80 + j] = 0;
            }
        }
    }

    Disk.prototype.get = function(sector) {
        return this.data.slice(sectorSize * sector, sectorSize * (sector + 1));
    };

    Disk.prototype.set = function(sector, value) {
        this.data.splice.apply(this.data, [sectorSize * sector, sectorSize].concat(value));
    };

    window.Disk = Disk;
})(window);
