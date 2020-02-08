
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, Field, FieldResult } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { RichTextField } from "../../../new_fields/RichTextField";
import { listSpec } from "../../../new_fields/Schema";
import { ComputedField, ScriptField } from "../../../new_fields/ScriptField";
import { Cast, FieldValue, NumCast } from "../../../new_fields/Types";
import { ImageField } from "../../../new_fields/URLField";
import { Docs } from "../../documents/Documents";
import { SetupDrag } from "../../util/DragManager";
import { CompiledScript, CompileScript, ScriptOptions } from "../../util/Scripting";
import { undoBatch } from "../../util/UndoManager";
import { FieldView, FieldViewProps } from './FieldView';
import "./KeyValueBox.scss";
import { KeyValuePair } from "./KeyValuePair";
import React = require("react");

export type KVPScript = {
    script: CompiledScript;
    type: "computed" | "script" | false;
    onDelegate: boolean;
};

@observer
export class KeyValueBox extends React.Component<FieldViewProps> {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(KeyValueBox, fieldStr); }

    private _mainCont = React.createRef<HTMLDivElement>();
    private _keyHeader = React.createRef<HTMLTableHeaderCellElement>();

    @observable private rows: KeyValuePair[] = [];
    @observable private _keyInput: string = "";
    @observable private _valueInput: string = "";
    @computed get splitPercentage() { return NumCast(this.props.Document.schemaSplitPercentage, 50); }
    get fieldDocToLayout() { return this.props.fieldKey ? FieldValue(Cast(this.props.Document[this.props.fieldKey], Doc)) : this.props.Document; }

    constructor(props: FieldViewProps) {
        super(props);
    }

    @action
    onEnterKey = (e: React.KeyboardEvent): void => {
        if (e.key === 'Enter') {
            e.stopPropagation();
            if (this._keyInput && this._valueInput && this.fieldDocToLayout) {
                if (KeyValueBox.SetField(this.fieldDocToLayout, this._keyInput, this._valueInput)) {
                    this._keyInput = "";
                    this._valueInput = "";
                }
            }
        }
    }
    public static CompileKVPScript(value: string): KVPScript | undefined {
        const eq = value.startsWith("=");
        value = eq ? value.substr(1) : value;
        const dubEq = value.startsWith(":=") ? "computed" : value.startsWith(";=") ? "script" : false;
        value = dubEq ? value.substr(2) : value;
        const options: ScriptOptions = { addReturn: true, params: { this: "Doc", _last_: "any" }, editable: false };
        if (dubEq) options.typecheck = false;
        const script = CompileScript(value, options);
        if (!script.compiled) {
            return undefined;
        }
        return { script, type: dubEq, onDelegate: eq };
    }

    public static ApplyKVPScript(doc: Doc, key: string, kvpScript: KVPScript, forceOnDelegate?: boolean): boolean {
        const { script, type, onDelegate } = kvpScript;
        //const target = onDelegate ? Doc.Layout(doc.layout) : Doc.GetProto(doc); // bcz: TODO need to be able to set fields on layout templates
        const target = forceOnDelegate || onDelegate ? doc : Doc.GetProto(doc);
        let field: Field;
        if (type === "computed") {
            field = new ComputedField(script);
        } else if (type === "script") {
            field = new ScriptField(script);
        } else {
            const res = script.run({ this: target }, console.log);
            if (!res.success) return false;
            field = res.result;
        }
        if (Field.IsField(field, true)) {
            target[key] = field;
            return true;
        }
        return false;
    }

    @undoBatch
    public static SetField(doc: Doc, key: string, value: string, forceOnDelegate?: boolean) {
        const script = this.CompileKVPScript(value);
        if (!script) return false;
        return this.ApplyKVPScript(doc, key, script, forceOnDelegate);
    }

    onPointerDown = (e: React.PointerEvent): void => {
        if (e.buttons === 1 && this.props.isSelected(true)) {
            e.stopPropagation();
        }
    }
    onPointerWheel = (e: React.WheelEvent): void => {
        e.stopPropagation();
    }

    rowHeight = () => 30;

    createTable = () => {
        const doc = this.fieldDocToLayout;
        if (!doc) {
            return <tr><td>Loading...</td></tr>;
        }
        const realDoc = doc;

        const ids: { [key: string]: string } = {};
        const protos = Doc.GetAllPrototypes(doc);
        for (const proto of protos) {
            Object.keys(proto).forEach(key => {
                if (!(key in ids) && realDoc[key] !== ComputedField.undefined) {
                    ids[key] = key;
                }
            });
        }

        const rows: JSX.Element[] = [];
        let i = 0;
        const self = this;
        for (const key of Object.keys(ids).slice().sort()) {
            rows.push(<KeyValuePair doc={realDoc} addDocTab={this.props.addDocTab} PanelWidth={this.props.PanelWidth} PanelHeight={this.rowHeight}
                ref={(function () {
                    let oldEl: KeyValuePair | undefined;
                    return (el: KeyValuePair) => {
                        if (oldEl) self.rows.splice(self.rows.indexOf(oldEl), 1);
                        oldEl = el;
                        if (el) self.rows.push(el);
                    };
                })()} keyWidth={100 - this.splitPercentage} rowStyle={"keyValueBox-" + (i++ % 2 ? "oddRow" : "evenRow")} key={key} keyName={key} />);
        }
        return rows;
    }

    @action
    keyChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._keyInput = e.currentTarget.value;
    }

    @action
    valueChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._valueInput = e.currentTarget.value;
    }

    newKeyValue = () =>
        (
            <tr className="keyValueBox-valueRow">
                <td className="keyValueBox-td-key" style={{ width: `${100 - this.splitPercentage}%` }}>
                    <input style={{ width: "100%" }} type="text" value={this._keyInput} placeholder="Key" onChange={this.keyChanged} />
                </td>
                <td className="keyValueBox-td-value" style={{ width: `${this.splitPercentage}%` }}>
                    <input style={{ width: "100%" }} type="text" value={this._valueInput} placeholder="Value" onChange={this.valueChanged} onKeyDown={this.onEnterKey} />
                </td>
            </tr>
        )

    @action
    onDividerMove = (e: PointerEvent): void => {
        const nativeWidth = this._mainCont.current!.getBoundingClientRect();
        this.props.Document.schemaSplitPercentage = Math.max(0, 100 - Math.round((e.clientX - nativeWidth.left) / nativeWidth.width * 100));
    }
    @action
    onDividerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onDividerMove);
        document.removeEventListener('pointerup', this.onDividerUp);
    }
    onDividerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        document.addEventListener("pointermove", this.onDividerMove);
        document.addEventListener('pointerup', this.onDividerUp);
    }

    getTemplate = async () => {
        const parent = Docs.Create.StackingDocument([], { _width: 800, _height: 800, title: "Template" });
        parent.singleColumn = false;
        parent.columnWidth = 100;
        for (const row of this.rows.filter(row => row.isChecked)) {
            await this.createTemplateField(parent, row);
            row.uncheck();
        }
        return parent;
    }

    createTemplateField = async (parentStackingDoc: Doc, row: KeyValuePair) => {
        const metaKey = row.props.keyName;
        const sourceDoc = await Cast(this.props.Document.data, Doc);
        if (!sourceDoc) {
            return;
        }

        const fieldTemplate = await this.inferType(sourceDoc[metaKey], metaKey);
        if (!fieldTemplate) {
            return;
        }
        const previousViewType = fieldTemplate._viewType;
        Doc.MakeMetadataFieldTemplate(fieldTemplate, Doc.GetProto(parentStackingDoc));
        previousViewType && (fieldTemplate._viewType = previousViewType);

        Cast(parentStackingDoc.data, listSpec(Doc))!.push(fieldTemplate);
    }

    inferType = async (data: FieldResult, metaKey: string) => {
        const options = { _width: 300, _height: 300, title: metaKey };
        if (data instanceof RichTextField || typeof data === "string" || typeof data === "number") {
            return Docs.Create.TextDocument("", options);
        } else if (data instanceof List) {
            if (data.length === 0) {
                return Docs.Create.StackingDocument([], options);
            }
            const first = await Cast(data[0], Doc);
            if (!first || !first.data) {
                return Docs.Create.StackingDocument([], options);
            }
            switch (first.data.constructor) {
                case RichTextField:
                    return Docs.Create.TreeDocument([], options);
                case ImageField:
                    return Docs.Create.MasonryDocument([], options);
                default:
                    console.log(`Template for ${first.data.constructor} not supported!`);
                    return undefined;
            }
        } else if (data instanceof ImageField) {
            return Docs.Create.ImageDocument("https://image.flaticon.com/icons/png/512/23/23765.png", options);
        }
        return new Doc;
    }

    render() {
        const dividerDragger = this.splitPercentage === 0 ? (null) :
            <div className="keyValueBox-dividerDragger" style={{ transform: `translate(calc(${100 - this.splitPercentage}% - 5px), 0px)` }}>
                <div className="keyValueBox-dividerDraggerThumb" onPointerDown={this.onDividerDown} />
            </div>;

        return (<div className="keyValueBox-cont" onWheel={this.onPointerWheel} ref={this._mainCont}>
            <table className="keyValueBox-table">
                <tbody className="keyValueBox-tbody">
                    <tr className="keyValueBox-header">
                        <th className="keyValueBox-key" style={{ width: `${100 - this.splitPercentage}%` }} ref={this._keyHeader}
                            onPointerDown={SetupDrag(this._keyHeader, this.getTemplate)}
                        >Key</th>
                        <th className="keyValueBox-fields" style={{ width: `${this.splitPercentage}%` }}>Fields</th>
                    </tr>
                    {this.createTable()}
                    {this.newKeyValue()}
                </tbody>
            </table>
            {dividerDragger}
        </div>);
    }
}
