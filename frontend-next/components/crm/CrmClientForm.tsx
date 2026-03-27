"use client";

import { useState } from "react";

import type { CrmClientDTO, CreateCrmClientBody, PatchCrmClientBody } from "@/lib/api";
import { maskCep, maskCnpj, maskCpf, maskUf, stripDigits } from "@/lib/crm-masks";

type Mode = "create" | "edit";

export type CrmClientFormProps = {
    mode: Mode;
    tenantIdForCreate: string;
    initial?: CrmClientDTO | null;
    submitting?: boolean;
    serverError?: string | null;
    onSubmit: (payload: CreateCrmClientBody | PatchCrmClientBody) => void | Promise<void>;
    onCancel: () => void;
};

export function CrmClientForm({
    mode,
    tenantIdForCreate,
    initial,
    submitting,
    serverError,
    onSubmit,
    onCancel,
}: CrmClientFormProps) {
    const [personType, setPersonType] = useState<"PF" | "PJ">(() => initial?.person_type ?? "PF");
    const [cpf, setCpf] = useState(() => (initial?.cpf ? maskCpf(initial.cpf) : ""));
    const [cnpj, setCnpj] = useState(() => (initial?.cnpj ? maskCnpj(initial.cnpj) : ""));
    const [displayName, setDisplayName] = useState(() => initial?.display_name ?? "");
    const [contactName, setContactName] = useState(() => initial?.contact_name ?? "");
    const [phonesStr, setPhonesStr] = useState(() => (initial?.phones || []).join(", "));
    const [addressLine1, setAddressLine1] = useState(() => initial?.address_line1 ?? "");
    const [addressLine2, setAddressLine2] = useState(() => initial?.address_line2 ?? "");
    const [neighborhood, setNeighborhood] = useState(() => initial?.neighborhood ?? "");
    const [postalCode, setPostalCode] = useState(() =>
        initial?.postal_code ? maskCep(initial.postal_code) : ""
    );
    const [city, setCity] = useState(() => initial?.city ?? "");
    const [stateUf, setStateUf] = useState(() => (initial?.state ? maskUf(initial.state) : ""));
    const [complement, setComplement] = useState(() => initial?.complement ?? "");
    const [noNumber, setNoNumber] = useState(() => Boolean(initial?.no_number));
    const [deadEndStreet, setDeadEndStreet] = useState(() => Boolean(initial?.dead_end_street));

    const parsePhones = (): string[] =>
        phonesStr
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const phones = parsePhones();
        if (mode === "create") {
            const body: CreateCrmClientBody = {
                person_type: personType,
                display_name: displayName.trim(),
                contact_name: contactName.trim() || null,
                phones,
                tenant_id: tenantIdForCreate,
                address_line1: addressLine1.trim() || null,
                address_line2: addressLine2.trim() || null,
                neighborhood: neighborhood.trim() || null,
                postal_code: stripDigits(postalCode) || null,
                city: city.trim() || null,
                state: stateUf.trim() || null,
                complement: complement.trim() || null,
                no_number: noNumber,
                dead_end_street: deadEndStreet,
            };
            if (personType === "PF") {
                body.cpf = stripDigits(cpf) || null;
                body.cnpj = null;
            } else {
                body.cnpj = stripDigits(cnpj) || null;
                body.cpf = null;
            }
            void onSubmit(body);
            return;
        }
        const patch: PatchCrmClientBody = {
            person_type: personType,
            display_name: displayName.trim(),
            contact_name: contactName.trim() || null,
            phones,
            address_line1: addressLine1.trim() || null,
            address_line2: addressLine2.trim() || null,
            neighborhood: neighborhood.trim() || null,
            postal_code: stripDigits(postalCode) || null,
            city: city.trim() || null,
            state: stateUf.trim() || null,
            complement: complement.trim() || null,
            no_number: noNumber,
            dead_end_street: deadEndStreet,
        };
        if (personType === "PF") {
            patch.cpf = stripDigits(cpf) || null;
            patch.cnpj = null;
        } else {
            patch.cnpj = stripDigits(cnpj) || null;
            patch.cpf = null;
        }
        void onSubmit(patch);
    };

    const inputCls =
        "w-full h-10 rounded-xl border border-border-light dark:border-border-dark bg-white dark:bg-surface-dark px-3 text-sm";

    return (
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[min(80vh,640px)] overflow-y-auto pr-1">
            {serverError && (
                <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm px-4 py-3 whitespace-pre-wrap">
                    {serverError}
                </div>
            )}

            <div>
                <label className="text-sm font-medium">Tipo</label>
                <select
                    className={`mt-1 ${inputCls}`}
                    value={personType}
                    onChange={(e) => setPersonType(e.target.value as "PF" | "PJ")}
                >
                    <option value="PF">Pessoa física</option>
                    <option value="PJ">Pessoa jurídica</option>
                </select>
            </div>

            {personType === "PF" ? (
                <div>
                    <label className="text-sm font-medium">CPF</label>
                    <input
                        className={`mt-1 ${inputCls} font-mono`}
                        value={cpf}
                        onChange={(e) => setCpf(maskCpf(e.target.value))}
                        placeholder="000.000.000-00"
                        autoComplete="off"
                    />
                    <p className="text-xs text-text-secondary-light mt-1">Opcional se ainda não houver documento.</p>
                </div>
            ) : (
                <div>
                    <label className="text-sm font-medium">CNPJ</label>
                    <input
                        className={`mt-1 ${inputCls} font-mono`}
                        value={cnpj}
                        onChange={(e) => setCnpj(maskCnpj(e.target.value))}
                        placeholder="00.000.000/0000-00"
                        autoComplete="off"
                    />
                </div>
            )}

            <div>
                <label className="text-sm font-medium">Nome exibido *</label>
                <input
                    className={`mt-1 ${inputCls}`}
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                />
            </div>
            <div>
                <label className="text-sm font-medium">Nome de contato</label>
                <input className={`mt-1 ${inputCls}`} value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div>
                <label className="text-sm font-medium">Telefones (separados por vírgula)</label>
                <input
                    className={`mt-1 ${inputCls}`}
                    value={phonesStr}
                    onChange={(e) => setPhonesStr(e.target.value)}
                    placeholder="11999999999, 1133334444"
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                    <label className="text-sm font-medium">Logradouro</label>
                    <input className={`mt-1 ${inputCls}`} value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
                </div>
                <div>
                    <label className="text-sm font-medium">Número / linha 2</label>
                    <input className={`mt-1 ${inputCls}`} value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
                </div>
                <div>
                    <label className="text-sm font-medium">Bairro</label>
                    <input className={`mt-1 ${inputCls}`} value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
                </div>
                <div>
                    <label className="text-sm font-medium">CEP</label>
                    <input
                        className={`mt-1 ${inputCls} font-mono`}
                        value={postalCode}
                        onChange={(e) => setPostalCode(maskCep(e.target.value))}
                        placeholder="00000-000"
                    />
                </div>
                <div>
                    <label className="text-sm font-medium">Cidade</label>
                    <input className={`mt-1 ${inputCls}`} value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div>
                    <label className="text-sm font-medium">UF</label>
                    <input
                        className={`mt-1 ${inputCls} uppercase`}
                        maxLength={2}
                        value={stateUf}
                        onChange={(e) => setStateUf(maskUf(e.target.value))}
                        placeholder="SP"
                    />
                </div>
                <div className="sm:col-span-2">
                    <label className="text-sm font-medium">Complemento</label>
                    <input className={`mt-1 ${inputCls}`} value={complement} onChange={(e) => setComplement(e.target.value)} />
                </div>
            </div>

            <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={noNumber} onChange={(e) => setNoNumber(e.target.checked)} />
                    Sem número
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={deadEndStreet} onChange={(e) => setDeadEndStreet(e.target.checked)} />
                    Rua sem saída
                </label>
            </div>

            <div className="flex flex-wrap gap-3 pt-2 border-t border-border-light dark:border-border-dark">
                <button
                    type="submit"
                    disabled={submitting}
                    className="h-10 px-5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
                >
                    {submitting ? "Salvando…" : mode === "create" ? "Criar cliente" : "Salvar alterações"}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="h-10 px-5 rounded-xl border border-border-light dark:border-border-dark text-sm"
                >
                    Cancelar
                </button>
            </div>
        </form>
    );
}
