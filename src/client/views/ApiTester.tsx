import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import { ApiUtils } from '../util/ApiUtils';
import { Doc } from '../../new_fields/Doc';
import { CollectionSchemaView } from './collections/CollectionSchemaView';
import { DocumentView } from './nodes/DocumentView';
import { Transform } from '../util/Transform';
import { returnFalse, emptyFunction, returnOne } from '../../Utils';

@observer
export class ApiTester extends React.Component {
    @observable
    url: string = "";

    @observable
    selector: string = "";

    @observable
    index?: number;

    @observable
    columns?: { name: string, enabled: boolean }[];
    @observable
    primaryColumn?: string;

    @observable
    doc?: Doc;

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
    onPrimaryKeyChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.primaryColumn = e.currentTarget.value;
    }

    submitCols = async () => {
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

    @action
    submit = async () => {
        if (!this.primaryColumn) {
            return;
        }
        const key = this.primaryColumn;
        const page = await ApiUtils.fetchHtml(this.url);
        const table = page?.querySelectorAll(this.selector)[this.index ?? 0];
        if (!(table instanceof HTMLTableElement)) {
            return;
        }

        runInAction(() => {
            this.doc = ApiUtils.parseTable(table, { columns: this.columns?.filter(col => col.enabled).map(col => col.name), primaryKey: key });
            this.columns = undefined;
        });
    }

    @action
    update = async () => {
        if (!this.doc) {
            return;
        }
        if (!this.primaryColumn) {
            return;
        }
        const doc = this.doc;
        const page = await ApiUtils.fetchHtml(this.url);
        const table = page?.querySelectorAll(this.selector)[this.index ?? 0];
        if (!(table instanceof HTMLTableElement)) {
            return;
        }

        runInAction(() => {
            ApiUtils.updateTable(table, doc);
            this.columns = undefined;
        });
    }

    submitApi = async () => {
        if (!this.primaryColumn) {
            return;
        }
        const key = this.primaryColumn;

        const doc = await ApiUtils.queryListApi(this.url, { primaryKey: key });
        runInAction(() => {
            this.doc = doc;
        });
    }

    updateApi = async () => {
        if (!this.doc) {
            return;
        }
        if (!this.primaryColumn) {
            return;
        }
        const doc = this.doc;

        runInAction(() => {
            ApiUtils.updateApi(this.url, doc);
            this.columns = undefined;
        });
    }

    render() {
        return (
            <div style={{ background: "gray" }}>
                <div>Url: <input value={this.url} onChange={this.onUrlChanged}></input></div>
                <div>Selector: <input value={this.selector} onChange={this.onSelectorChanged}></input></div>
                <div>Index: <input value={this.index} onChange={this.onIndexChanged}></input></div>
                <div>Primary Key: <input value={this.primaryColumn} onChange={this.onPrimaryKeyChanged}></input></div>
                {this.columns ? this.columns.map(col => {
                    return (
                        <div key={col.name}>
                            <label>
                                <input checked={col.enabled} type="checkbox"
                                    onChange={action((e: React.ChangeEvent<HTMLInputElement>) => col.enabled = e.currentTarget.checked)} name={col.name} />
                                {col.name}
                            </label>
                            <label>
                                Primary:
                            <input checked={this.primaryColumn === col.name} type="checkbox"
                                    onChange={action((e: React.ChangeEvent<HTMLInputElement>) => this.primaryColumn = col.name)} name={col.name} />
                            </label>
                        </div>
                    );
                }) : null}
                <div><button onClick={this.submitCols}>Get Columns</button></div>
                <div><button onClick={this.submit}>Submit</button></div>
                <div><button onClick={this.update} disabled={this.doc === undefined}>Update</button></div>
                <div><button onClick={this.submitApi}>Submit Api</button></div>
                <div><button onClick={this.updateApi} disabled={this.doc === undefined}>Update Api</button></div>
                <div>
                    {this.doc ? <DocumentView Document={this.doc} ContainingCollectionDoc={undefined}
                        ContainingCollectionView={undefined} LibraryPath={[]} ScreenToLocalTransform={() => Transform.Identity()} renderDepth={0}
                        ruleProvider={undefined}
                        PanelHeight={() => 500} PanelWidth={() => 500}
                        ContentScaling={returnOne}
                        focus={emptyFunction}
                        parentActive={returnFalse}
                        whenActiveChanged={emptyFunction}
                        bringToFront={emptyFunction}
                        addDocTab={returnFalse}
                        pinToPres={emptyFunction}
                        zoomToScale={emptyFunction}
                        backgroundColor={() => undefined}
                        getScale={returnOne}
                    /> : null}
                </div>
            </div>
        );
    }
}