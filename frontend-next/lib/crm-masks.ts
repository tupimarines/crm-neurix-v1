/**
 * Máscaras PF/PJ e CEP — apenas apresentação; a API normaliza CPF/CNPJ no backend.
 */

export function stripDigits(s: string): string {
    return s.replace(/\D/g, "");
}

export function maskCpf(input: string): string {
    const x = stripDigits(input).slice(0, 11);
    if (x.length <= 3) return x;
    if (x.length <= 6) return `${x.slice(0, 3)}.${x.slice(3)}`;
    if (x.length <= 9) return `${x.slice(0, 3)}.${x.slice(3, 6)}.${x.slice(6)}`;
    return `${x.slice(0, 3)}.${x.slice(3, 6)}.${x.slice(6, 9)}-${x.slice(9)}`;
}

export function maskCnpj(input: string): string {
    const x = stripDigits(input).slice(0, 14);
    if (x.length <= 2) return x;
    if (x.length <= 5) return `${x.slice(0, 2)}.${x.slice(2)}`;
    if (x.length <= 8) return `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5)}`;
    if (x.length <= 12) return `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5, 8)}/${x.slice(8)}`;
    return `${x.slice(0, 2)}.${x.slice(2, 5)}.${x.slice(5, 8)}/${x.slice(8, 12)}-${x.slice(12)}`;
}

export function maskCep(input: string): string {
    const x = stripDigits(input).slice(0, 8);
    if (x.length <= 5) return x;
    return `${x.slice(0, 5)}-${x.slice(5)}`;
}

export function maskUf(input: string): string {
    return input
        .replace(/[^a-zA-Z]/g, "")
        .slice(0, 2)
        .toUpperCase();
}
