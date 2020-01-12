import * as React from 'react';
import { Doc } from '../../../new_fields/Doc';
import './TableApiDialog.scss';
import { action, observable, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import { ApiUtils, TableColumnSpec } from '../../util/ApiUtils';
import { CompileScript } from '../../util/Scripting';
import { ScriptField } from '../../../new_fields/ScriptField';
import { Utils } from "../../../Utils";

export interface TableApiDialogProps {
    onCreate(doc: Doc): void;
}

@observer
export class TableApiDialog extends React.Component<TableApiDialogProps> {

    get numCustom() {
        return this.columns?.filter(col => col.custom).length ?? 0;
    }

    @observable
    url: string = "";

    @observable
    selector: string = "";

    @observable
    hasHeaderRow: boolean = false;

    @observable
    columns?: { col: TableColumnSpec, enabled: boolean, custom: boolean, key: string }[];

    @observable
    primaryColumn?: TableColumnSpec;

    @observable
    index?: number;

    @action
    onUrlChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.url = e.currentTarget.value;
        this.columns = undefined;
    }

    @action
    onSelectorChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.selector = e.currentTarget.value;
        this.columns = undefined;
    }

    @action
    onIndexChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        const index = parseInt(e.currentTarget.value);
        if (!isNaN(index)) {
            this.index = index;
            this.columns = undefined;
        }
    }

    @action
    addColumn = () => {
        if (!this.columns) {
            this.columns = [];
        }
        const numCustom = this.numCustom;
        this.columns.push({ col: { index: numCustom, name: `column_${numCustom}` }, enabled: true, custom: true, key: Utils.GenerateGuid() });
    }

    getColumns = async () => {
        if (!this.hasHeaderRow) {
            runInAction(() => this.columns = undefined);
            return;
        }
        const page = await ApiUtils.fetchHtml(this.url);
        const table = page?.querySelector(this.selector);
        if (!(table instanceof HTMLTableElement)) {
            return;
        }
        runInAction(() => {
            this.columns = ApiUtils.getTableHeaders(table).map(name => ({ col: { tableName: name }, enabled: true, custom: false, key: Utils.GenerateDeterministicGuid(name) }));
            this.primaryColumn = this.columns[0].col;
        });
    }

    create = async () => {
        if (!this.primaryColumn || !this.selector) {
            return;
        }
        const key = this.primaryColumn;
        const page = await ApiUtils.fetchHtml(this.url);
        const table = page?.querySelectorAll(this.selector)[this.index ?? 0];
        if (!(table instanceof HTMLTableElement)) {
            return;
        }

        const doc = ApiUtils.parseTable(table, {
            columns: this.columns?.filter(col => col.enabled).map(({ col }) => col), primaryKey: ApiUtils.getColumnName(key),
            hasHeaderRow: this.hasHeaderRow
        });

        doc.selector = this.selector;
        doc.url = this.url;
        if (this.index !== undefined) {
            doc.index = this.index;
        }

        const script = `
            ApiUtils.fetchHtml(this.url as string).then(page => {
                const table = page?.querySelectorAll(this.selector as string)[this.index as number ?? 0];
                ApiUtils.updateTable(table, this);
            });
        `;

        const result = CompileScript(script, { params: { this: Doc.name }, editable: true });
        if (!result.compiled) {
            throw new Error("Couldn't compile api update script");
        }

        doc.updateScript = new ScriptField(result);

        runInAction(() => {
            this.columns = undefined;
        });

        this.props.onCreate(doc);
    }

    render() {
        const columns = this.columns ?
            <table>
                <thead>
                    <tr key="_headerRow">
                        <td></td>
                        <td className="tableApi-columnHeader">Name</td>
                        <td className="tableApi-columnHeader">Enabled</td>
                        <td className="tableApi-columnHeader">Primary Key?</td>
                    </tr>
                </thead>
                <tbody>
                    {this.columns.map(col => {
                        const name = ApiUtils.getColumnName(col.col);
                        return col.custom ? (
                            <tr key={col.key} className="tableApi-row">
                                <td><input value={ApiUtils.getColumnIdentifier(col.col)} onChange={action((e: React.ChangeEvent<HTMLInputElement>) => {
                                    if (!("index" in col.col)) return;
                                    const num = parseInt(e.currentTarget.value);
                                    if (!isNaN(num)) {
                                        col.col.index = num;
                                    }
                                })} /></td>
                                <td><input value={name} onChange={action((e: React.ChangeEvent<HTMLInputElement>) => {
                                    col.col.name = e.currentTarget.value;
                                })} /></td>
                                <td className="tableApi-columnRow"><input checked={col.enabled} type="checkbox"
                                    onChange={action((e: React.ChangeEvent<HTMLInputElement>) => col.enabled = e.currentTarget.checked)} name={name} /></td>
                                <td className="tableApi-columnRow"><input checked={this.primaryColumn === col.col} type="checkbox"
                                    onChange={action((_e: React.ChangeEvent<HTMLInputElement>) => this.primaryColumn = col.col)} name={name} /></td>
                            </tr>
                        ) : (
                                <tr key={col.key} className="tableApi-row">
                                    <td>{name}</td>
                                    <td><input value={name} onChange={action((e: React.ChangeEvent<HTMLInputElement>) => {
                                        col.col.name = e.currentTarget.value;
                                    })} /></td>
                                    <td className="tableApi-columnRow"><input checked={col.enabled} type="checkbox"
                                        onChange={action((e: React.ChangeEvent<HTMLInputElement>) => col.enabled = e.currentTarget.checked)} name={name} /></td>
                                    <td className="tableApi-columnRow"><input checked={this.primaryColumn === col.col} type="checkbox"
                                        onChange={action((_e: React.ChangeEvent<HTMLInputElement>) => this.primaryColumn = col.col)} name={name} /></td>
                                </tr>
                            );
                    })}
                </tbody>
            </table > : null;
        return (
            <div className="tableApi-outerDiv">
                <div className="tableApi-form">
                    <label>Url:</label>
                    <input value={this.url} onChange={this.onUrlChanged} />

                    <label>Selector:</label>
                    <input value={this.selector} onChange={this.onSelectorChanged} />

                    <label>Index:</label>
                    <input value={this.index} onChange={this.onIndexChanged} />
                    <label>Has header row:</label>
                    <input checked={this.hasHeaderRow} type="checkbox" onChange={action((e: React.ChangeEvent<HTMLInputElement>) => this.hasHeaderRow = e.currentTarget.checked)} />
                </div>
                <div className="tableApi-columns">
                    {columns}
                </div>
                <div className="tableApi-buttons">
                    <button className="tableApi-button" onClick={this.addColumn}>+</button>
                    <button className="tableApi-button" onClick={this.getColumns}>{this.hasHeaderRow ? "Get Columns" : "Clear Columns"}</button>
                    <button className="tableApi-button" disabled={this.primaryColumn === undefined || this.selector === undefined} onClick={this.create}>Create</button>
                </div>
            </div>
        );
    }
}
