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
    columns?: { name: string, enabled: boolean }[];

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

    submitCols = async () => {
        const page = await ApiUtils.fetchHtml(this.url);
        const table = page?.querySelector(this.selector);
        if (!(table instanceof HTMLTableElement)) {
            return;
        }
        runInAction(() => {
            this.columns = ApiUtils.getTableHeaders(table).map(name => ({ name, enabled: true }));
        });
    }

    @action
    submit = async () => {
        const page = await ApiUtils.fetchHtml(this.url);
        const table = page?.querySelector(this.selector);
        if (!(table instanceof HTMLTableElement)) {
            return;
        }

        runInAction(() => {
            this.doc = ApiUtils.parseTable(table, this.columns?.filter(col => col.enabled).map(col => col.name));
            this.columns = undefined;
        });
    }

    render() {
        return (
            <div style={{ background: "gray" }}>
                <div><input value={this.url} onChange={this.onUrlChanged}></input></div>
                <div><input value={this.selector} onChange={this.onSelectorChanged}></input></div>
                {this.columns ? this.columns.map(col => {
                    return (
                        <label key={col.name} >
                            <input checked={col.enabled} type="checkbox"
                                onChange={action((e: React.ChangeEvent<HTMLInputElement>) => col.enabled = e.currentTarget.checked)} name={col.name} />
                            {col.name}
                        </label>
                    );
                }) : null}
                <div><button onClick={this.submitCols}>Get Columns</button></div>
                <div><button onClick={this.submit}>Submit</button></div>
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
        );
    }
}