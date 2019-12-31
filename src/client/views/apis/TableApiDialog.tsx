import * as React from 'react';
import { Doc } from '../../../new_fields/Doc';
import './TableApiDialog.scss';
import { action, observable, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import { ApiUtils } from '../../util/ApiUtils';
import { CompileScript } from '../../util/Scripting';
import { ScriptField } from '../../../new_fields/ScriptField';

export interface TableApiDialogProps {
    onCreate(doc: Doc): void;
}

@observer
export class TableApiDialog extends React.Component<TableApiDialogProps> {

    @observable
    url: string = "";

    @observable
    selector: string = "";

    @observable
    columns?: { name: string, enabled: boolean }[];

    @observable
    primaryColumn?: string;

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

    getColumns = async () => {
        const page = await ApiUtils.fetchHtml(this.url);
        const table = page?.querySelector(this.selector);
        if (!(table instanceof HTMLTableElement)) {
            return;
        }
        runInAction(() => {
            this.columns = ApiUtils.getTableHeaders(table).map(name => ({ name, enabled: true }));
            this.primaryColumn = this.columns[0].name;
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

        const doc = ApiUtils.parseTable(table, { columns: this.columns?.filter(col => col.enabled).map(col => col.name), primaryKey: key });

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
                        <td className="tableApi-columnHeader">Enabled</td>
                        <td className="tableApi-columnHeader">Primary Key?</td>
                    </tr>
                </thead>
                <tbody>
                    {this.columns.map(col => {
                        return (
                            <tr key={col.name} className="tableApi-row">
                                <td>{col.name}</td>
                                <td className="tableApi-columnRow"><input checked={col.enabled} type="checkbox"
                                    onChange={action((e: React.ChangeEvent<HTMLInputElement>) => col.enabled = e.currentTarget.checked)} name={col.name} /></td>
                                <td className="tableApi-columnRow"><input checked={this.primaryColumn === col.name} type="checkbox"
                                    onChange={action((e: React.ChangeEvent<HTMLInputElement>) => this.primaryColumn = col.name)} name={col.name} /></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table> : null;
        return (
            <div className="tableApi-outerDiv">
                <div className="tableApi-form">
                    <label>Url:</label>
                    <input value={this.url} onChange={this.onUrlChanged} />

                    <label>Selector:</label>
                    <input value={this.selector} onChange={this.onSelectorChanged} />

                    <label>Index:</label>
                    <input value={this.index} onChange={this.onIndexChanged} />
                </div>
                <div className="tableApi-columns">
                    {columns}
                </div>
                <div className="tableApi-buttons">
                    <button className="tableApi-button" onClick={this.getColumns}>Get Columns</button>
                    <button className="tableApi-button" disabled={this.primaryColumn === undefined || this.selector === undefined} onClick={this.create}>Create</button>
                </div>
            </div>
        );
    }
}