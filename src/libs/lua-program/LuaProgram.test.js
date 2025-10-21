const LuaProgram = require('./LuaProgram');

describe('pushValue/peekValue', () => {
    it('should return 5 when pushing 5', () => {
        const l = new LuaProgram();
        l.pushValue(5);
        const x = l.peekValue();
        expect(x).toBe(5);
        l.close();
    });
    it('should return "alpha" when pushing "alpha', () => {
        const l = new LuaProgram();
        l.pushValue('alpha');
        const x = l.peekValue();
        expect(x).toBe('alpha');
        l.close();
    });
    it('should return true when pushing true', () => {
        const l = new LuaProgram();
        l.pushValue(true);
        const x = l.peekValue();
        expect(x).toBe(true);
        l.close();
    });
    it('should return null when pushing null', () => {
        const l = new LuaProgram();
        l.pushValue(null);
        const x = l.peekValue();
        expect(x).toBeNull();
        l.close();
    });
    it('should return ["alpha", "beta", "gamma"] when pushing this ["alpha", "beta", "gamma"]', () => {
        const l = new LuaProgram();
        l.pushValue(['alpha', 'beta', 'gamma']);
        const x = l.peekValue();
        expect(x).toEqual(['alpha', 'beta', 'gamma']);
        l.close();
    });
    it('should return {"alpha": 100, "beta": 200, "gamma": 300} when pushing this {"alpha": 100, "beta": 200, "gamma": 300}', () => {
        const l = new LuaProgram();
        l.pushValue({ alpha: 100, beta: 200, gamma: 300 });
        const x = l.peekValue();
        expect(x).toEqual({ alpha: 100, beta: 200, gamma: 300 });
        l.close();
    });
    describe('when pushing several values', () => {
        const l = new LuaProgram();
        l.pushValue(5);
        l.pushValue('alpha');
        l.pushValue('beta');
        l.pushValue(true);
        l.pushValue(false);
        l.pushValue(['alpha', 'beta', 'gamma']);
        l.pushValue(['alpha', 'beta', ['gamma', 'delta']]);
        l.pushValue({ alpha: 100, beta: 200, gamma: 300, directions: ['north', 'west'] });
        afterAll(() => {
            l.close();
        });
        it('should return 5, then, 5 when asking value at offset -1 twice in a row', () => {
            expect(l.peekValue(-8)).toBe(5);
            expect(l.peekValue(-8)).toBe(5);
        });
        it("should return { alpha: 100, beta: 200, gamma: 300, directions: ['north', 'west'] } when asking for offset -1", () => {
            expect(l.peekValue(-1)).toEqual({
                alpha: 100,
                beta: 200,
                gamma: 300,
                directions: ['north', 'west'],
            });
        });
        it("should return ['alpha', 'beta', 'gamma'] twice when asking for offset -3 twice", () => {
            expect(l.peekValue(-3)).toEqual(['alpha', 'beta', 'gamma']);
            expect(l.peekValue(-3)).toEqual(['alpha', 'beta', 'gamma']);
        });
        it("should return ['alpha', 'beta', ['gamma', 'delta']] twice when asking for offset -2 twice", () => {
            expect(l.peekValue(-2)).toEqual(['alpha', 'beta', ['gamma', 'delta']]);
            expect(l.peekValue(-2)).toEqual(['alpha', 'beta', ['gamma', 'delta']]);
        });
        it('should return {"alpha": 100, "beta": {"gamma": 300}} twice when pushing object containing object and asked twice', function () {
            const l = new LuaProgram();
            l.pushValue({ alpha: 100, beta: { gamma: 300 } });
            expect(l.peekValue(-1)).toEqual({ alpha: 100, beta: { gamma: 300 } });
            expect(l.peekValue(-1)).toEqual({ alpha: 100, beta: { gamma: 300 } });
        });
        it("should return { alpha: 100, beta: 200, gamma: 300, directions: ['north', 'west'] } twice when asking for offset -1 twice", () => {
            expect(l.peekValue()).toEqual({
                alpha: 100,
                beta: 200,
                gamma: 300,
                directions: ['north', 'west'],
            });
            expect(l.peekValue()).toEqual({
                alpha: 100,
                beta: 200,
                gamma: 300,
                directions: ['north', 'west'],
            });
        });
        it("should return { alpha: 100, beta: 200, gamma: 300, directions: ['north', 'west'] } and 5 when asking for offset -1 and -7", () => {
            expect(l.peekValue()).toEqual({
                alpha: 100,
                beta: 200,
                gamma: 300,
                directions: ['north', 'west'],
            });
            expect(l.peekValue(-8)).toEqual(5);
        });

        it("should return ['alpha', 'beta', 'gamma'] when asking for offset -2", () => {
            expect(l.peekValue(-3)).toEqual(['alpha', 'beta', 'gamma']);
        });
        it('should return false when asking for offset -3', () => {
            expect(l.peekValue(-4)).toBe(false);
        });
        it('should return true when asking for offset -4', () => {
            expect(l.peekValue(-5)).toBe(true);
        });
        it('should return beta when asking for offset -5', () => {
            expect(l.peekValue(-6)).toBe('beta');
        });
        it('should return alpha when asking for offset -6', () => {
            expect(l.peekValue(-7)).toBe('alpha');
        });
        it('should return 5 when asking for offset -7', () => {
            expect(l.peekValue(-8)).toBe(5);
        });
    });
});

describe('isArray', () => {
    it('should return false when pushing a non-array', () => {
        const l = new LuaProgram();
        l.pushValue(1);
        expect(l.isArray(-1)).toBeFalsy();
        l.close();
    });
    describe('when pushing an array', () => {
        it('should return true when array is full of numbers', () => {
            const l = new LuaProgram();
            l.pushValue([10, 20, 30, 40]);
            expect(l.isArray(-1)).toBeTruthy();
            l.close();
        });
        it('should return true when array is full of strings', () => {
            const l = new LuaProgram();
            l.pushValue(['alpha', 'beta', 'gamma']);
            expect(l.isArray(-1)).toBeTruthy();
            l.close();
        });
        it('should return true when array is full of boolean', () => {
            const l = new LuaProgram();
            l.pushValue([false, true, true, false]);
            expect(l.isArray(-1)).toBeTruthy();
            l.close();
        });
        it('should return true when array is full of any type', () => {
            const l = new LuaProgram();
            l.pushValue([false, 100, 'alpha', null]);
            expect(l.isArray(-1)).toBeTruthy();
            l.close();
        });
        it('should return true when array empty', () => {
            const l = new LuaProgram();
            l.pushValue([]);
            expect(l.isArray(-1)).toBeTruthy();
            l.close();
        });
        it('should return true when array contains arrays', () => {
            const l = new LuaProgram();
            l.pushValue([
                [10, 20, 30],
                [40, 50, 60],
            ]);
            expect(l.isArray(-1)).toBeTruthy();
            l.close();
        });
        it('should return true when array contains arrays of arrays', () => {
            const l = new LuaProgram();
            l.pushValue([
                [10, ['alpha', 'beta'], 30],
                [40, 50, ['gamma', 'delta']],
            ]);
            expect(l.isArray(-1)).toBeTruthy();
            l.close();
        });
    });
    describe('when asking twice', () => {
        it('should return true twice when array is full of numbers', () => {
            const l = new LuaProgram();
            l.pushValue([10, 20, 30, 40]);
            expect(l.isArray(-1)).toBeTruthy();
            expect(l.isArray(-1)).toBeTruthy();
            l.close();
        });
        it('should return true twice when array contains arrays of arrays', () => {
            const l = new LuaProgram();
            l.pushValue([
                [10, ['alpha', 'beta'], 30],
                [40, 50, ['gamma', 'delta']],
            ]);
            expect(l.isArray(-1)).toBeTruthy();
            expect(l.isArray(-1)).toBeTruthy();
            l.close();
        });
        it('should return true twice when array contains arrays of arrays', () => {
            const l = new LuaProgram();
            l.pushValue([
                [10, ['alpha', 'beta'], 30],
                [40, 50, ['gamma', 'delta']],
            ]);
            expect(l.isArray(-1)).toBeTruthy();
            expect(l.isArray(-1)).toBeTruthy();
            l.close();
        });
    });
    it('should return false when pushing objects (non numeric index arrays)', () => {
        const l = new LuaProgram();
        l.pushValue({
            alpha: 1,
            beta: 2,
            gamma: 3,
        });
        expect(l.isArray(-1)).toBeFalsy();
        l.close();
    });
});

describe('bindFunction', () => {
    it('should return 55 when calling js function from lua', () => {
        const l = new LuaProgram();
        let result = 0;
        l.bindFunction('exportResult', (n) => {
            result = n;
        });
        l.loadChunk(
            `exportResult(55)
        `,
            'code'
        );
        expect(result).toBe(55);
    });
});

describe('loadPackage', function () {
    it('should call a function from another chunk', () => {
        const l = new LuaProgram();
        let result = 0;
        l.bindFunction('exportResult', (n) => {
            result = n;
        });
        l.loadPackage([
            {
                name: 'chunk1',
                code: `
                    function main(n)
                        exportResult(n * 2)
                    end
                `,
            },
            {
                name: 'chunk2',
                code: `
                main(155)
                `,
            },
        ]);
        expect(result).toBe(310);
    });
});

describe('callFunction', () => {
    it('should return 44 when passing [11, 44, 33, 01] to a lua function that returns the greatest value', () => {
        const l = new LuaProgram();
        l.loadPackage([
            {
                name: 'chunk1',
                code: `
function myMaxFunction(tableau)
    if #tableau == 0 then
        return nil -- no values found in table
    end
    local max_val = tableau[1]
    for i = 2, #tableau do
        if tableau[i] > max_val then
            max_val = tableau[i]
        end
    end
    return max_val
end
`,
            },
        ]);
        const x = l.callFunction('myMaxFunction', [11, 44, 33, 1]);
        expect(x).toBe(44);
    });
});
