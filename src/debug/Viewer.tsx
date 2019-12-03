import { action, configure, observable, ObservableMap, Lambda } from 'mobx';
import "normalize.css";
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { observer } from 'mobx-react';
import { Doc, Field, FieldResult, Opt } from '../new_fields/Doc';
import { DocServer } from '../client/DocServer';
import { Id } from '../new_fields/FieldSymbols';
import { List } from '../new_fields/List';
import { URLField } from '../new_fields/URLField';
import { EditableView } from '../client/views/EditableView';
import { CompileScript } from '../client/util/Scripting';
import { RichTextField } from '../new_fields/RichTextField';
import { DateField } from '../new_fields/DateField';
import { ScriptField } from '../new_fields/ScriptField';
import CursorField from '../new_fields/CursorField';

DateField;
URLField;
ScriptField;
CursorField;


function applyToDoc(doc: { [index: string]: FieldResult }, key: string, scriptString: string): boolean;
function applyToDoc(doc: { [index: number]: FieldResult }, key: number, scriptString: string): boolean;
function applyToDoc(doc: any, key: string | number, scriptString: string): boolean {
    const script = CompileScript(scriptString, { addReturn: true, params: { this: doc instanceof Doc ? Doc.name : List.name } });
    if (!script.compiled) {
        return false;
    }
    const res = script.run({ this: doc });
    if (!res.success) return false;
    if (!Field.IsField(res.result, true)) return false;
    doc[key] = res.result;
    return true;
}

configure({
    enforceActions: "observed"
});

@observer
class ListViewer extends React.Component<{ field: List<Field> }>{
    @observable
    expanded = false;

    @action
    onClick = (e: React.MouseEvent) => {
        this.expanded = !this.expanded;
        e.stopPropagation();
    }

    render() {
        let content;
        if (this.expanded) {
            content = (
                <div>
                    {this.props.field.map((field, index) => <DebugViewer field={field} key={index} setValue={value => applyToDoc(this.props.field, index, value)} />)}
                </div>
            );
        } else {
            content = <>[...]</>;
        }
        return (
            <div>
                <button onClick={this.onClick}>Toggle</button>
                {content}
            </div >
        );
    }
}

@observer
class DocumentViewer extends React.Component<{ field: Doc }> {
    @observable
    expanded = false;

    @action
    onClick = (e: React.MouseEvent) => {
        this.expanded = !this.expanded;
        e.stopPropagation();
    }

    render() {
        let content;
        if (this.expanded) {
            const keys = Object.keys(this.props.field);
            const fields = keys.map(key => {
                return (
                    <div key={key}>
                        <b>({key}): </b>
                        <DebugViewer field={this.props.field[key]} setValue={value => applyToDoc(this.props.field, key, value)}></DebugViewer>
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
                <button onClick={this.onClick}>Toggle</button>
                {content}
            </div >
        );
    }
}

@observer
class DebugViewer extends React.Component<{ field: FieldResult, setValue(value: string): boolean }> {

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
        } else if (field instanceof RichTextField) {
            content = <p>RTF: {field.Data}</p>;
        } else if (field instanceof URLField) {
            content = <p>{field.url.href}</p>;
        } else if (field instanceof Promise) {
            return <p>Field loading</p>;
        } else {
            return <p>Unrecognized field type</p>;
        }

        return <EditableView GetValue={() => Field.toScriptString(field)} SetValue={this.props.setValue}
            contents={content}></EditableView>;
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
                    {this.fields.map((field, index) => <DebugViewer field={field} key={index} setValue={() => false}></DebugViewer>)}
                </div>
            </>
        );
    }
}

(async function () {
    await DocServer.init(window.location.protocol, window.location.hostname, 4321, "viewer");
    ReactDOM.render((
        <div style={{ position: "absolute", width: "100%", height: "100%" }}>
            <Viewer />
        </div>),
        document.getElementById('root')
    );
})();