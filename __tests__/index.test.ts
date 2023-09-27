import { PassThrough } from 'stream';
import { Wire } from '../src/index.js';

describe('Wire', () => {
  describe('readable', () => {
    it('should emit readable when data is received', () => {
      const onReadable = vitest.fn();
      const stream = new PassThrough();
      const wire = new Wire(stream);
      wire.on('readable', onReadable);

      stream.write('data');
      expect(onReadable).toHaveBeenCalledTimes(1);
    });

    it('should not emit readable when data is received and generators are pending', () => {
      const onReadable = vitest.fn();
      const stream = new PassThrough();
      const wire = new Wire(stream);
      wire.on('readable', onReadable);

      wire.readLine();
      stream.write('data');
      expect(onReadable).toHaveBeenCalledTimes(0);
      stream.write('\r\n');
    });

    it('should emit readable when data is received, after generator is done and autoResume is true', async () => {
      const onReadable = vitest.fn();
      const stream = new PassThrough();
      const wire = new Wire(stream, { autoResume: true });
      wire.on('readable', onReadable);

      const promise = wire.readLine();
      stream.write('data\r\n');
      expect(onReadable).toHaveBeenCalledTimes(0);
      await promise;

      stream.write('data');
      expect(onReadable).toHaveBeenCalledTimes(1);
    });

    it('should not emit readable when data is received, after generator is done and autoResume is false', async () => {
      const onReadable = vitest.fn();
      const stream = new PassThrough();
      const wire = new Wire(stream, { autoResume: false });
      wire.on('readable', onReadable);

      const promise = wire.readLine();
      stream.write('data\r\n');
      expect(onReadable).toHaveBeenCalledTimes(0);
      await promise;

      stream.write('data');
      expect(onReadable).toHaveBeenCalledTimes(0);
    });

    it('should emit readable when data is received, after generator is done, autoResume is false, and resume was called', async () => {
      const onReadable = vitest.fn();
      const stream = new PassThrough();
      const wire = new Wire(stream, { autoResume: false });
      wire.on('readable', onReadable);

      const promise = wire.readLine();
      stream.write('data\r\n');
      expect(onReadable).toHaveBeenCalledTimes(0);
      await promise;

      stream.write('data');
      expect(onReadable).toHaveBeenCalledTimes(0);
    });

    it('should not emit readable when data is received, after generator is done, autoResume is true, and pause was called', async () => {
      const onReadable = vitest.fn();
      const stream = new PassThrough();
      const wire = new Wire(stream, { autoResume: true });
      wire.on('readable', onReadable);

      const promise = wire.readLine();
      stream.write('data\r\n');
      expect(onReadable).toHaveBeenCalledTimes(0);
      await promise;
      wire.pause();

      stream.write('data');
      expect(onReadable).toHaveBeenCalledTimes(0);
    });

    it('should emit readable if the constructor is called with a stream that already contains data', () => {
      const onReadable = vitest.fn();
      const stream = new PassThrough();
      stream.write('data');

      const wire = new Wire(stream);
      wire.on('readable', onReadable);
      expect(onReadable).toHaveBeenCalledTimes(1);
    });
  });

  describe('read', () => {
    it('should read data from buffer', async () => {
      const stream = new PassThrough();
      const wire = new Wire(stream);
      stream.write('some data');
      expect(await wire.read(4)).toBe('some');
      expect(await wire.read(5)).toBe(' data');
    });

    it('should wait for data to be available', async () => {
      const stream = new PassThrough();
      const wire = new Wire(stream);
      const test = async () => {
        const data = await wire.read(4);
        expect(data).toBe('some');
      };
      stream.write('some data');
      await test();
    });

    it('should timeout if data is not available in time', () => {
      vi.useFakeTimers();
      const stream = new PassThrough();
      const wire = new Wire(stream);
      expect(wire.read(4)).rejects.toThrow(Error);
      vi.runAllTimers();
    });

    it('should be able to read data if the constructor is called with a stream that already contains data', async () => {
      const stream = new PassThrough();
      stream.write('data');

      const wire = new Wire(stream);
      expect(await wire.read(4)).toBe('data');
    });
  });

  describe('readLine', () => {
    it('should read data from buffer', async () => {
      const stream = new PassThrough();
      const wire = new Wire(stream);
      stream.write('some data\r\n');
      expect(await wire.readLine()).toBe('some data');
    });

    it('should wait for data to be available', async () => {
      const stream = new PassThrough();
      const wire = new Wire(stream);

      const test = async () => {
        const data = await wire.readLine();
        expect(data).toBe('some data');
      };
      stream.write('some data\r\n');
      await test();
    });

    it('should use ending from options', async () => {
      const stream = new PassThrough();
      const wire = new Wire(stream, { ending: '\n' });
      stream.write('some data\n');
      expect(await wire.readLine()).toBe('some data');
    });

    it('should handle multiple read line calls', async () => {
      const stream = new PassThrough();
      const wire = new Wire(stream);
      const data = ['test 1', 'test 2', 'test 3'];
      const calls = [wire.readLine(), wire.readLine(), wire.readLine()];
      stream.write(data.join('\r\n') + '\r\n');
      expect(await Promise.all(calls)).toEqual(expect.arrayContaining(data));
    });
  });

  describe('readUntil', () => {
    it('should read data from buffer', async () => {
      const stream = new PassThrough();
      const wire = new Wire(stream);
      stream.write('some data');
      expect(await wire.readUntil('data')).toBe('some ');
    });

    it('should wait for data to be available', async () => {
      const stream = new PassThrough();
      const wire = new Wire(stream);

      const test = async () => {
        const data = await wire.readUntil('data');
        expect(data).toBe('some ');
      };

      stream.write('some data');
      await test();
    });
  });

  describe('write', () => {
    it('should write data to buffer', async () => {
      const stream = new PassThrough();
      const wire = new Wire(stream);
      wire.write('some data');
      expect(await wire.read(9)).toBe('some data');
    });
  });

  describe('writeLine', () => {
    it('should write data to buffer', async () => {
      const stream = new PassThrough();
      const wire = new Wire(stream);
      wire.writeLine('some data');
      expect(await wire.read(11)).toBe('some data\r\n');
    });

    it('should use ending from options', async () => {
      const stream = new PassThrough();
      const wire = new Wire(stream, { ending: '\n' });
      wire.writeLine('some data');
      expect(await wire.read(10)).toBe('some data\n');
    });
  });

  describe('writeLines', () => {
    it('should write data to buffer', async () => {
      const stream = new PassThrough();
      const wire = new Wire(stream);
      wire.writeLines(['some', 'data']);
      expect(await wire.read(12)).toBe('some\r\ndata\r\n');
    });

    it('should use ending from options', async () => {
      const stream = new PassThrough();
      const wire = new Wire(stream, { ending: '\n' });
      wire.writeLines(['some', 'data']);
      expect(await wire.read(10)).toBe('some\ndata\n');
    });
  });

  describe('waitFor', () => {
    it('should wait for data to match predicate', async () => {
      const stream = new PassThrough();
      const wire = new Wire(stream);

      const test = async () => {
        const buffer = await wire.waitFor(buffer => buffer.includes('data'));
        expect(buffer).toBe('some data\r\n');
        expect(await wire.readLine()).toBe('some data');
      };

      stream.write('some data\r\n');
      await test();
    });
  });

  describe('close', () => {
    it('should cause pending read operations to throw when Wire.close() is called', () => {
      const stream = new PassThrough();
      const wire = new Wire(stream);
      expect(wire.read(4)).rejects.toThrow(Error);
      wire.close();
    });

    it('should cause pending read operations to throw when stream.destroy() is called', () => {
      const stream = new PassThrough();
      const wire = new Wire(stream);
      expect(wire.read(4)).rejects.toThrow(Error);
      stream.destroy();
    });

    it('should cause pending read operations to throw when stream.end() is called', () => {
      const stream = new PassThrough();
      const wire = new Wire(stream);
      expect(wire.read(4)).rejects.toThrow(Error);
      stream.end();
    });
  });
});
