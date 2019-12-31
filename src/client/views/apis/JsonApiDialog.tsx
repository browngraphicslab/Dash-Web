import './JsonApiDialog.scss';

import * as React from 'react';
import { Doc } from '../../../new_fields/Doc';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import { ApiUtils } from '../../util/ApiUtils';

import * as rp from 'request-promise';
import { Utils } from '../../../Utils';
import { Scripting, CompileScript } from '../../util/Scripting';
import { ScriptField } from '../../../new_fields/ScriptField';

export interface JsonApiDialogProps {
    onCreate(doc: Doc): void;
}

@observer
export class JsonApiDialog extends React.Component<JsonApiDialogProps> {

    @observable
    url: string = "";

    @observable
    selector: string = "";

    @observable
    columns?: { name: string, enabled: boolean }[];

    @observable
    primaryColumn?: string;

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

    getColumns = async () => {
        const data = await rp.get(Utils.CorsProxy(this.url), { json: true });
        let table: any[];
        if (Array.isArray(data)) {
            table = data;
        } else if (this.selector !== undefined) {
            const t = data[this.selector];
            if (Array.isArray(t)) {
                table = t;
            }
        } else {
            return [];
        }

        runInAction(() => {
            this.columns = ApiUtils.getJsonColumns(table).map(name => ({ name, enabled: true }));
            this.primaryColumn = this.columns[0].name;
        });
    }

    create = async () => {
        if (!this.primaryColumn) {
            return;
        }
        const data = await rp.get(Utils.CorsProxy(this.url), { json: true });
        let table: any[];
        if (Array.isArray(data)) {
            table = data;
        } else if (typeof data === "object" && this.selector !== undefined) {
            const t = data[this.selector];
            if (Array.isArray(t)) {
                table = t;
            } else {
                return;
            }
        } else {
            return;
        }

        const doc = ApiUtils.queryListApi(table, { primaryKey: this.primaryColumn, selector: this.selector, columns: this.columns?.filter(col => col.enabled).map(col => col.name) });

        doc.selector = this.selector;
        doc.url = this.url;

        const script = `
            rp.get(corsPrefix(this.url as string), { json: true }).then(json => {
                const table = this.selector ? json[this.selector as string] : json;
                ApiUtils.updateApi(table, this);
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
                        <th></th>
                        <th className="tableApi-columnHeader">Enabled</th>
                        <th className="tableApi-columnHeader">Primary Key?</th>
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