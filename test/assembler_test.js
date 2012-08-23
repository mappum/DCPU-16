var Assembler = require("assembler");
var CPU = require("cpu");
var assert = require("assert");

function memoryForAssembly() {
    var cpu = new CPU();
    var assembler = new Assembler(cpu);
    var code = Array.prototype.join.call(arguments, "\n");
    assembler.compile(code + "\n end: DAT 0 \n .ORG 0xffff \n DAT end");
    return cpu.mem.slice(0, cpu.mem[0xffff]);
}

module.exports = {
    'SET should have opcode 1': function() {
        assert.eql(memoryForAssembly("SET a, a"), [0x0001]);
    },
    'ADD should have opcode 2': function() {
        assert.eql(memoryForAssembly("ADD a, a"), [0x0002]);
    },
    'SUB should have opcode 3': function() {
        assert.eql(memoryForAssembly("SUB a, a"), [0x0003]);
    },
    'MUL should have opcode 4': function() {
        assert.eql(memoryForAssembly("MUL a, a"), [0x0004]);
    },
    'MLI should have opcode 5': function() {
        assert.eql(memoryForAssembly("MLI a, a"), [0x0005]);
    },
    'DIV should have opcode 6': function() {
        assert.eql(memoryForAssembly("DIV a, a"), [0x0006]);
    },
    'DVI should have opcode 7': function() {
        assert.eql(memoryForAssembly("DVI a, a"), [0x0007]);
    },
    'MOD should have opcode 8': function() {
        assert.eql(memoryForAssembly("MOD a, a"), [0x0008]);
    },
    'MDI should have opcode 9': function() {
        assert.eql(memoryForAssembly("MDI a, a"), [0x0009]);
    },
    'AND should have opcode A': function() {
        assert.eql(memoryForAssembly("AND a, a"), [0x000a]);
    },
    'BOR should have opcode B': function() {
        assert.eql(memoryForAssembly("BOR a, a"), [0x000b]);
    },
    'XOR should have opcode C': function() {
        assert.eql(memoryForAssembly("XOR a, a"), [0x000c]);
    },
    'SHR should have opcode D': function() {
        assert.eql(memoryForAssembly("SHR a, a"), [0x000d]);
    },
    'ASR should have opcode E': function() {
        assert.eql(memoryForAssembly("ASR a, a"), [0x000e]);
    },
    'SHL should have opcode F': function() {
        assert.eql(memoryForAssembly("SHL a, a"), [0x000f]);
    },
    'IFB should have opcode 10': function() {
        assert.eql(memoryForAssembly("IFB a, a"), [0x0010]);
    },
    'IFC should have opcode 11': function() {
        assert.eql(memoryForAssembly("IFC a, a"), [0x0011]);
    },
    'IFE should have opcode 12': function() {
        assert.eql(memoryForAssembly("IFE a, a"), [0x0012]);
    },
    'IFN should have opcode 13': function() {
        assert.eql(memoryForAssembly("IFN a, a"), [0x0013]);
    },
    'IFG should have opcode 14': function() {
        assert.eql(memoryForAssembly("IFG a, a"), [0x0014]);
    },
    'IFA should have opcode 15': function() {
        assert.eql(memoryForAssembly("IFA a, a"), [0x0015]);
    },
    'IFL should have opcode 16': function() {
        assert.eql(memoryForAssembly("IFL a, a"), [0x0016]);
    },
    'IFU should have opcode 17': function() {
        assert.eql(memoryForAssembly("IFU a, a"), [0x0017]);
    },
    'ADX should have opcode 1A': function() {
        assert.eql(memoryForAssembly("ADX a, a"), [0x001a]);
    },
    'SBX should have opcode 1B': function() {
        assert.eql(memoryForAssembly("SBX a, a"), [0x001b]);
    },
    'STI should have opcode 1E': function() {
        assert.eql(memoryForAssembly("STI a, a"), [0x001e]);
    },
    'STD should have opcode 1F': function() {
        assert.eql(memoryForAssembly("STD a, a"), [0x001f]);
    },
    'JSR should have special opcode 1': function() {
        assert.eql(memoryForAssembly("JSR a"), [0x1 << 5]);
    },
    'BRK should have special opcode 2': function() {
        assert.eql(memoryForAssembly("BRK"), [0x2 << 5]);
    },
    'INT should have special opcode 8': function() {
        assert.eql(memoryForAssembly("INT a"), [0x8 << 5]);
    },
    'IAG should have special opcode 9': function() {
        assert.eql(memoryForAssembly("IAG a"), [0x9 << 5]);
    },
    'IAS should have special opcode A': function() {
        assert.eql(memoryForAssembly("IAS a"), [0xa << 5]);
    },
    'RFI should have special opcode B': function() {
        assert.eql(memoryForAssembly("RFI a"), [0xb << 5]);
    },
    'IAQ should have special opcode C': function() {
        assert.eql(memoryForAssembly("IAQ a"), [0xc << 5]);
    },
    'HWN should have special opcode 10': function() {
        assert.eql(memoryForAssembly("HWN a"), [0x10 << 5]);
    },
    'HWQ should have special opcode 11': function() {
        assert.eql(memoryForAssembly("HWQ a"), [0x11 << 5]);
    },
    'HWI should have special opcode 12': function() {
        assert.eql(memoryForAssembly("HWI a"), [0x12 << 5]);
    },
    'opcodes should be case insensitive': function() {
        assert.eql(memoryForAssembly("Set a, a",
                                     "set a, a"), [0x0001, 0x0001]);
    },
    'A values should be encoded as 0': function() {
        assert.eql(memoryForAssembly("SET a, a"), [0x0001]);
    },
    'B values should be encoded as 1': function() {
        assert.eql(memoryForAssembly("SET b, b"), [0x1 << 10 | 0x1 << 5 | 1]);
    },
    'C values should be encoded as 2': function() {
        assert.eql(memoryForAssembly("SET c, c"), [0x2 << 10 | 0x2 << 5 | 1]);
    },
    'X values should be encoded as 3': function() {
        assert.eql(memoryForAssembly("SET x, x"), [0x3 << 10 | 0x3 << 5 | 1]);
    },
    'Y values should be encoded as 4': function() {
        assert.eql(memoryForAssembly("SET y, y"), [0x4 << 10 | 0x4 << 5 | 1]);
    },
    'Z values should be encoded as 5': function() {
        assert.eql(memoryForAssembly("SET z, z"), [0x5 << 10 | 0x5 << 5 | 1]);
    },
    'I values should be encoded as 6': function() {
        assert.eql(memoryForAssembly("SET i, i"), [0x6 << 10 | 0x6 << 5 | 1]);
    },
    'J values should be encoded as 7': function() {
        assert.eql(memoryForAssembly("SET j, j"), [0x7 << 10 | 0x7 << 5 | 1]);
    },
    '[A] values should be encoded as 8': function() {
        assert.eql(memoryForAssembly("SET [a], [a]"), [0x8 << 10 | 0x8 << 5 | 1]);
    },
    '[B] values should be encoded as 9': function() {
        assert.eql(memoryForAssembly("SET [b], [b]"), [0x9 << 10 | 0x9 << 5 | 1]);
    },
    '[C] values should be encoded as A': function() {
        assert.eql(memoryForAssembly("SET [c], [c]"), [0xa << 10 | 0xa << 5 | 1]);
    },
    '[X] values should be encoded as B': function() {
        assert.eql(memoryForAssembly("SET [x], [x]"), [0xb << 10 | 0xb << 5 | 1]);
    },
    '[Y] values should be encoded as C': function() {
        assert.eql(memoryForAssembly("SET [y], [y]"), [0xc << 10 | 0xc << 5 | 1]);
    },
    '[Z] values should be encoded as D': function() {
        assert.eql(memoryForAssembly("SET [z], [z]"), [0xd << 10 | 0xd << 5 | 1]);
    },
    '[I] values should be encoded as E': function() {
        assert.eql(memoryForAssembly("SET [i], [i]"), [0xe << 10 | 0xe << 5 | 1]);
    },
    '[J] values should be encoded as F': function() {
        assert.eql(memoryForAssembly("SET [j], [j]"), [0xf << 10 | 0xf << 5 | 1]);
    },
    '[A+n] values should be encoded as 10': function() {
        assert.eql(memoryForAssembly("SET [a+2], [a+1]"), [0x10 << 10 | 0x10 << 5 | 1, 0x0001, 0x0002]);
    },
    '[B+n] values should be encoded as 11': function() {
        assert.eql(memoryForAssembly("SET [b+2], [b+1]"), [0x11 << 10 | 0x11 << 5 | 1, 0x0001, 0x0002]);
    },
    '[C+n] values should be encoded as 12': function() {
        assert.eql(memoryForAssembly("SET [c+2], [c+1]"), [0x12 << 10 | 0x12 << 5 | 1, 0x0001, 0x0002]);
    },
    '[X+n] values should be encoded as 13': function() {
        assert.eql(memoryForAssembly("SET [x+2], [x+1]"), [0x13 << 10 | 0x13 << 5 | 1, 0x0001, 0x0002]);
    },
    '[Y+n] values should be encoded as 14': function() {
        assert.eql(memoryForAssembly("SET [y+2], [y+1]"), [0x14 << 10 | 0x14 << 5 | 1, 0x0001, 0x0002]);
    },
    '[Z+n] values should be encoded as 15': function() {
        assert.eql(memoryForAssembly("SET [z+2], [z+1]"), [0x15 << 10 | 0x15 << 5 | 1, 0x0001, 0x0002]);
    },
    '[I+n] values should be encoded as 16': function() {
        assert.eql(memoryForAssembly("SET [i+2], [i+1]"), [0x16 << 10 | 0x16 << 5 | 1, 0x0001, 0x0002]);
    },
    '[J+n] values should be encoded as 17': function() {
        assert.eql(memoryForAssembly("SET [j+2], [j+1]"), [0x17 << 10 | 0x17 << 5 | 1, 0x0001, 0x0002]);
    },
    'PUSH/POP values should be encoded as 18': function() {
        assert.eql(memoryForAssembly("SET push, pop"), [0x18 << 10 | 0x18 << 5 | 1]);
    },
    '[SP++]/[--SP] values should also be encoded as 18': function() {
        assert.eql(memoryForAssembly("SET [sp++], [--sp]"), [0x18 << 10 | 0x18 << 5 | 1]);
    },
    // 'SP++/--SP values should not be allowed without pointer brackets': function() {
    //     assert.throws(function () { memoryForAssembly("SET sp++, --sp"); });
    // },
    'PEEK values should be encoded as 19': function() {
        assert.eql(memoryForAssembly("SET peek, peek"), [0x19 << 10 | 0x19 << 5 | 1]);
    },
    '[SP] values should be encoded as 19': function() {
        assert.eql(memoryForAssembly("SET [sp], [sp]"), [0x19 << 10 | 0x19 << 5 | 1]);
    },
    '[SP+n] values should be encoded as 1A': function() {
        assert.eql(memoryForAssembly("SET [sp+2], [sp+1]"), [0x1a << 10 | 0x1a << 5 | 1, 0x0001, 0x0002]);
    },
    'SP values should be encoded as 1B': function() {
        assert.eql(memoryForAssembly("SET sp, sp"), [0x1b << 10 | 0x1b << 5 | 1]);
    },
    'PC values should be encoded as 1C': function() {
        assert.eql(memoryForAssembly("SET pc, pc"), [0x1c << 10 | 0x1c << 5 | 1]);
    },
    'EX values should be encoded as 1D': function() {
        assert.eql(memoryForAssembly("SET ex, ex"), [0x1d << 10 | 0x1d << 5 | 1]);
    },
    '[n] values should be encoded as 1E': function() {
        assert.eql(memoryForAssembly("SET [2], [1]"), [0x1e << 10 | 0x1e << 5 | 1, 0x0001, 0x0002]);
    },
    'large literal values should be encoded as 1F': function() {
        assert.eql(memoryForAssembly("SET 0x20, 0x1f"), [0x1f << 10 | 0x1f << 5 | 1, 0x1f, 0x20]);
    },
    'literal -1 should be encoded as 20': function() {
        assert.eql(memoryForAssembly("SET a, 0xffff"), [0x20 << 10 | 1]);
    },
    'literal 0 should be encoded as 21': function() {
        assert.eql(memoryForAssembly("SET a, 0"), [0x21 << 10 | 1]);
    },
    'literal 0x1e should be encoded as 3F': function() {
        assert.eql(memoryForAssembly("SET a, 0x1e"), [0x3f << 10 | 1]);
    },
    'values should be case insensitive': function() {
        assert.eql(memoryForAssembly("SET a, a",
                                     "SET A, A"), [0x0001, 0x0001]);
    },
    'literal data should be assembled': function() {
        assert.eql(memoryForAssembly('DAT 0x42, 0x43, 0x44'), [0x42, 0x43, 0x44]);
    },
    'simple string literal data should be assembled': function() {
        assert.eql(memoryForAssembly('DAT "ABC"'), [0x41, 0x42, 0x43]);
    },
    'string literals with escapes should be assembled': function() {
        assert.eql(memoryForAssembly('DAT "\\n\\r\\a\\"\\0\\\\"'), [0xa, 0xd, 0x7, 0x22, 0x0, 0x5c]);
    },
    'string literals with unrecognized escapes should not be allowed': function() {
        assert.throws(function () { memoryForAssembly('DAT "\\?"'); }, /unrecognized/i);
    },
    'unterminated string literals should not be allowed': function() {
        assert.throws(function () { memoryForAssembly('DAT "'); }, /unterminated/i);
    },
    'escaped backslash followed by escaped double quote should work': function() {
        assert.eql(memoryForAssembly('DAT "\\\\\\""'), [0x5c, 0x22]);
    },
    'the origin directive should work': function() {
        var cpu = new CPU();
        var assembler = new Assembler(cpu);
        assembler.compile(".ORG 0x1000 \n dat 0x0042");
        assert.eql(cpu.mem[0x1000], 0x42);
    },
    'comments should be ignored': function() {
        assert.eql(memoryForAssembly("; comment"), []);
    },
    'string literals containing semicolons should work': function() {
        assert.eql(memoryForAssembly('DAT ";"'), [0x3b]);
    },
    'labels starting with colon should work': function() {
        assert.eql(memoryForAssembly("DAT label",
                                     ".ORG 0x1000",
                                     ":label DAT 0")[0], 0x1000);
    },
    'labels ending with colon should also work': function() {
        assert.eql(memoryForAssembly("DAT label",
                                     ".ORG 0x1000",
                                     "label: DAT 0")[0], 0x1000);
    },
    'labels should be case insensitive': function() {
        assert.eql(memoryForAssembly("DAT label",
                                     ".ORG 0x1000",
                                     ":LABEL DAT 0")[0], 0x1000);
    },
    'duplicate labels should not be allowed': function() {
        assert.throws(function () { memoryForAssembly("label:",
                                                      "label:"); }, /already defined/i);
    },
    'undefined labels should not be allowed': function() {
        assert.throws(function () { memoryForAssembly("DAT label"); }, /not defined/i);
    },
    'arguments containing colons should not be allowed': function() {
        assert.throws(function () { memoryForAssembly("DAT la:bel"); }, /illegal/i);
    },
    'labels containing colons should not be allowed': function() {
        assert.throws(function () { memoryForAssembly("la:bel:"); }, /illegal/i);
    },
    'spaces should be allowed inside pointer brackets': function() {
        assert.eql(memoryForAssembly("SET [ a + 1 ], a"), [0x10 << 5 | 1, 1]);
    },
    'unclosed pointer brackets should not be allowed': function() {
        assert.throws(function () { memoryForAssembly("SET [ a, a"); }, /unclosed/i);
    },
    'single character string arguments should be encoded as large literal values': function() {
        assert.eql(memoryForAssembly('SET "B", "A"'), [0x1f << 10 | 0x1f << 5 | 1, 0x41, 0x42]);
    },
    // 'multiple character string arguments should not be allowed': function() {
    //     assert.throws(function () { memoryForAssembly('set "CD", "AB"'); });
    // },
    'register offsets should not allow two registers': function() {
        assert.throws(function () { memoryForAssembly("SET a, [a+a]"); }, /invalid/i);
    },
    'register offsets should not allow two offsets': function() {
        assert.throws(function () { memoryForAssembly("SET a, [1+1]"); }, /invalid/i);
    },
    'register offsets should allow a label': function() {
        assert.eql(memoryForAssembly("SET a, [a+label]",
                                     ".ORG 0x1000",
                                     "label: DAT 0")[1], 0x1000);
    },
    'register offsets should not allow two labels': function() {
        assert.throws(function () { memoryForAssembly("SET a, [label+label]",
                                                      ".ORG 0x1000 label:"); }, /invalid/i);
    },
    'register offsets should only allow offsets that fit in a word': function() {
        assert.throws(function () { memoryForAssembly("SET a, [a+0x100000]"); }, /invalid/i);
    },
    'only pointers that fit in a word should be allowed': function() {
        assert.throws(function () { memoryForAssembly("SET a, [0x100000]"); }, /invalid/i);
    },
    'too many arguments should not be allowed': function() {
        assert.throws(function () { memoryForAssembly("SET a, a, a"); }, /argument count/i);
    },
    'too few arguments should not be allowed': function() {
        assert.throws(function () { memoryForAssembly("SET a"); }, /argument count/i);
    },
    'DAT without arguments should not be allowed': function() {
        assert.throws(function () { memoryForAssembly("DAT"); }, /argument count/i);
    },
    'programs larger than memory should not be allowed': function() {
        var code = "";
        for (var i = 0; i < 0x10001; i++) {
            code += "dat 0\n";
        }
        assert.throws(function () { memoryForAssembly(code); });
    },
    '.org addresses outside of memory should not be allowed': function() {
        assert.throws(function () { memoryForAssembly(".ORG 0x10001",
                                                      "DAT 0"); });
    }
};
