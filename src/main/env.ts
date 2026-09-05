import packageJson from '../../package.json';

export const disableAutoUpdates = () => {
    return (
        Boolean(process.env['DISABLE_AUTO_UPDATES']) || packageJson.productName === 'Feishin Custom'
    );
};

export const isMacOS = () => {
    return process.platform === 'darwin';
};

export const isWindows = () => {
    return process.platform === 'win32';
};

export const isLinux = () => {
    return process.platform === 'linux';
};
