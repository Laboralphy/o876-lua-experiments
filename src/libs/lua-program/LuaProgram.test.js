const LuaProgram = require('./LuaProgram');

describe('pushValue/peekValue', () => {
    it('should return 5 when pushing 5', () => {
        const l = new LuaProgram();
        l.pushValue(5);
        const x = l.peekValue();
        expect(x).toBe(5);
    });
    it('should return "alpha" when pushing "alpha', () => {
        const l = new LuaProgram();
        l.pushValue('alpha');
        const x = l.peekValue();
        expect(x).toBe('alpha');
    });
    it('should return true when pushing true', () => {
        const l = new LuaProgram();
        l.pushValue(true);
        const x = l.peekValue();
        expect(x).toBe(true);
    });
    it('should return null when pushing null', () => {
        const l = new LuaProgram();
        l.pushValue(null);
        const x = l.peekValue();
        expect(x).toBeNull();
    });
    it('should return ["alpha", "beta", "gamma"] when pushing this array', () => {
        const l = new LuaProgram();
        l.pushValue(['alpha', 'beta', 'gamma']);
        const x = l.peekValue();
        expect(x).toEqual(['alpha', 'beta', 'gamma']);
    });
});

describe('isArray', () => {
    it('should return false when pushing a non-array', () => {
        const l = new LuaProgram();
        l.pushValue(1);
        expect(l.isArray(-1)).toBeFalsy();
    });
    it('should return true when pushing an array', () => {
        const l = new LuaProgram();
        l.pushValue(['alpha', 'beta', 'gamma']);
        expect(l.isArray(-1)).toBeTruthy();
    });
});
