(function(window){
    var states = {
        'STATE_NO_DATA': 0x0,
        'STATE_RUNNING': 0x1,
        'STATE_TURNING': 0x2
    };

    var errors = {
        'ERROR_NONE': 0x0,
        'ERROR_BROKEN': 0xffff
    };
    
    function SPED3(container) {
        this.id = 0x42babf3c;
        this.version = 0x0003;
        this.manufacturer = 0x1eb37e91;

        this.enabled = true;
        this.cpu = null;

        this.reset();

        var width = parseInt(container.style.width, 10);
        var height = parseInt(container.style.height, 10);

        this.cameraTarget = new THREE.Vector3(128, 128, 128);
        this.cameraDistance = 380;

        this.camera = new THREE.PerspectiveCamera(70, width / height, 1, 1000);
        this.camera.position.x = this.cameraTarget.x;
        this.camera.position.y = this.cameraTarget.y;
        this.camera.position.z = this.cameraTarget.z - this.cameraDistance;
        this.camera.lookAt(this.cameraTarget);

        this.scene = new THREE.Scene();

        this.renderer = new THREE.CanvasRenderer();
        this.renderer.setSize(width, height);
        container.appendChild(this.renderer.domElement);

        this._drawListeners = [];

        this.render();
    }

    SPED3.prototype.render = function() {
        requestAnimationFrame(this.render.bind(this));

        if(this.enabled && this.cpu) {
            var now = Date.now();

            if(this.rotation !== this.rotationTarget) {
                var deltaTime = (now - (this.lastFrame || now)) / 1000;
                var deltaRotation = Math.min(this.rotationTarget - this.rotation, deltaTime * this.rotationSpeed);

                this.rotation += deltaRotation;
                this.camera.position.x = this.cameraTarget.x + Math.sin(this.rotation * (Math.PI / 180)) * this.cameraDistance;
                this.camera.position.z = this.cameraTarget.z + Math.cos(this.rotation * (Math.PI / 180)) * this.cameraDistance;

                this.camera.lookAt(this.cameraTarget);
            }

            this.renderer.render(this.scene, this.camera);

            this.lastFrame = now;
        }
    };

    SPED3.prototype.update = function() {
        var i;

        this.clear();

        var PI2 = Math.PI * 2;
        var renderVertex = function(context) {
            context.beginPath();
            context.arc(0, 0, 1, 0, PI2, true);
            context.closePath();
            context.fill();
        };
        var materials = [
            new THREE.ParticleCanvasMaterial({color: 0, program: renderVertex}),
            new THREE.ParticleCanvasMaterial({color: 0xA11313, program: renderVertex}),
            new THREE.ParticleCanvasMaterial({color: 0x117A18, program: renderVertex}),
            new THREE.ParticleCanvasMaterial({color: 0x15158A, program: renderVertex}),

            new THREE.ParticleCanvasMaterial({color: 0x888, program: renderVertex}),
            new THREE.ParticleCanvasMaterial({color: 0xA11313, program: renderVertex}),
            new THREE.ParticleCanvasMaterial({color: 0x0EF01D, program: renderVertex}),
            new THREE.ParticleCanvasMaterial({color: 0x3B3BFF, program: renderVertex})
        ];
        var lastGeometry = new THREE.Geometry();
        var lastPoint = null;

        for(i = 0; i < this.cpu.mem.length; i += 2) {
            var word1 = this.cpu.mem[i];
            var word2 = this.cpu.mem[i+1];

            var x = word1 & 0xff;
            var y = (word1 >> 8) & 0xff;
            var z = word2 & 0xff;
            var color = (word2 >> 8) & 0x7;

            var vertex = new THREE.Particle(materials[color]);
            vertex.position.x = x;
            vertex.position.y = z;
            vertex.position.z = y;
            vertex.scale.x = vertex.scale.y = vertex.scale.z = 2;
            vertex.dynamic = true;
            this.scene.add(vertex);

            geometry.vertices.push(vertex.position);
        }

        var line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x1FCC2A, opacity: 0.3 }));
        line.dynamic = true;
        this.scene.add(line);

        for(i = 0; i < this._drawListeners.length; i++) {
            this._drawListeners[i]();
        }
    };
    
    SPED3.prototype.onConnect = function(cpu) {
        this.cpu = cpu;
        this.memoryListener = this.cpu.onSet(0, 0, this.update.bind(this));
    };

    SPED3.prototype.poll = function() {
        this.cpu.set('b', this.getState());
        this.cpu.set('c', this.lastError);
    };
    
    SPED3.prototype.map = function(memoryOffset, memoryLength) {
        this.memoryListener.address = memoryOffset;
        this.memoryListener.length = memoryLength * 2;
        this.update();
    };
    
    SPED3.prototype.rotate = function(rotationTarget) {
        this.rotationTarget = rotationTarget;
    };

    SPED3.prototype.getState = function() {
        if(this.memoryLength === 0) return states.STATE_NO_DATA;
        else if(this.rotationTarget === this.rotation) return states.STATE_RUNNING;
        else return states.STATE_TURNING;
    };
    
    SPED3.prototype.onInterrupt = function(callback) {
        switch(this.cpu.get('a')) {
            case 0: this.poll(); break;
            case 1: this.map(this.cpu.get('x'), this.cpu.get('y')); break;
            case 2: this.rotate(this.cpu.get('x')); break;
        }
        callback();
    };

    SPED3.prototype.onDraw = function(listener) {
        this._drawListeners.push(listener);
    };

    SPED3.prototype.offDraw = function(listener) {
        var index = this._drawListeners.indexOf(listener);
        if(index > -1) this._drawListeners = this._drawListeners.splice(index, 1);
    };

    SPED3.prototype.reset = function() {
        if(this.scene) this.clear();

        this.rotation = 0;
        this.rotationTarget = 0;

        this.rotationTarget = 0;
        this.rotation = 0;
        this.rotationSpeed = 50;
        this.lastFrame = null;

        this.lastError = errors.ERROR_NONE;
    };

    SPED3.prototype.clear = function() {
        var objects = this.scene.getDescendants();
        for(i = 0; i < objects.length; i++) {
            this.scene.remove(objects[i]);
        }
    };

    window.SPED3 = SPED3;
})(window);
