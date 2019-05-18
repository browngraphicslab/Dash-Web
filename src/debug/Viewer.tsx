import { action, configure, observable, ObservableMap, Lambda } from 'mobx';
import "normalize.css";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { observer } from 'mobx-react';
import { CurrentUserUtils } from '../server/authentication/models/current_user_utils';
import { RouteStore } from '../server/RouteStore';
import { emptyFunction } from '../Utils';
import { Docs } from '../client/documents/Documents';
import { SetupDrag } from '../client/util/DragManager';
import { Transform } from '../client/util/Transform';
import { UndoManager } from '../client/util/UndoManager';
import { PresentationView } from '../client/views/PresentationView';
import { CollectionDockingView } from '../client/views/collections/CollectionDockingView';
import { ContextMenu } from '../client/views/ContextMenu';
import { DocumentDecorations } from '../client/views/DocumentDecorations';
import { InkingControl } from '../client/views/InkingControl';
import { MainOverlayTextBox } from '../client/views/MainOverlayTextBox';
import { DocumentView } from '../client/views/nodes/DocumentView';
import { PreviewCursor } from '../client/views/PreviewCursor';
import { SearchBox } from '../client/views/SearchBox';
import { SelectionManager } from '../client/util/SelectionManager';
import { Doc, Field, FieldResult } from '../new_fields/Doc';
import { Cast } from '../new_fields/Types';
import { DocServer } from '../client/DocServer';
import { listSpec } from '../new_fields/Schema';
import { Id } from '../new_fields/RefField';
import { HistoryUtil } from '../client/util/History';
import { List } from '../new_fields/List';
import { URLField } from '../new_fields/URLField';

CurrentUserUtils;
RouteStore;
emptyFunction;
Docs;
SetupDrag;
Transform;
UndoManager;
PresentationView;
CollectionDockingView;
ContextMenu;
DocumentDecorations;
InkingControl;
MainOverlayTextBox;
DocumentView;
PreviewCursor;
SearchBox;
SelectionManager;
Doc;
Cast;
DocServer;
listSpec;
Id;
HistoryUtil;

configure({
    enforceActions: "observed"
});

@observer
class ListViewer extends React.Component<{ field: List<Field> }>{
    @observable
    expanded = false;

    render() {
        let content;
        if (this.expanded) {
            content = (
                <div>
                    {this.props.field.map((field, index) => <DebugViewer field={field} key={index} />)}
                </div>
            );
        } else {
            content = <>[...]</>;
        }
        return (
            <div>
                <button onClick={action(() => this.expanded = !this.expanded)}>Toggle</button>
                {content}
            </div >
        );
    }
}

@observer
class DocumentViewer extends React.Component<{ field: Doc }> {
    @observable
    expanded = false;
    render() {
        let content;
        if (this.expanded) {
            const keys = Object.keys(this.props.field);
            let fields = keys.map(key => {
                return (
                    <div key={key}>
                        <b>({key}): </b>
                        <DebugViewer field={this.props.field[key]}></DebugViewer>
                    </div>
                );
            });
            content = (
                <div>
                    Document ({this.props.field[Id]})
                <div style={{ paddingLeft: "25px" }}>
                        {fields}
                    </div>
                </div>
            );
        } else {
            content = <>[...] ({this.props.field[Id]})</>;
        }
        return (
            <div>
                <button onClick={action(() => this.expanded = !this.expanded)}>Toggle</button>
                {content}
            </div >
        );
    }
}

@observer
class DebugViewer extends React.Component<{ field: FieldResult }> {

    render() {
        let content;
        const field = this.props.field;
        if (field instanceof List) {
            content = (<ListViewer field={field} />);
        } else if (field instanceof Doc) {
            content = (<DocumentViewer field={field} />);
        } else if (typeof field === "string") {
            content = <p>"{field}"</p>;
        } else if (typeof field === "number" || typeof field === "boolean") {
            content = <p>{field}</p>;
        } else if (field instanceof URLField) {
            content = <p>{field.url.href}</p>;
        } else {
            content = <p>Unrecognized field type</p>;
        }
        return content;
    }
}

@observer
class Viewer extends React.Component {
    @observable
    private idToAdd: string = '';

    @observable
    private fields: Field[] = [];

    @action
    inputOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.idToAdd = e.target.value;
    }

    @action
    onKeyPress = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Enter") {
            DocServer.GetRefField(this.idToAdd).then(action((field: any) => {
                if (field !== undefined) {
                    this.fields.push(field);
                }
            }));
            this.idToAdd = "";
        }
    }

    render() {
        return (
            <>
                <input value={this.idToAdd}
                    onChange={this.inputOnChange}
                    onKeyDown={this.onKeyPress} />
                <div>
                    {this.fields.map((field, index) => <DebugViewer field={field} key={index}></DebugViewer>)}
                </div>
            </>
        );
    }
}

ReactDOM.render((
    <div style={{ position: "absolute", width: "100%", height: "100%" }}>
        <Viewer />
    </div>),
    document.getElementById('root')
);