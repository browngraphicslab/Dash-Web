import React = require("react");
import { observer } from "mobx-react";
import { EditableView } from "../../views/EditableView";
import { action, computed } from "mobx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { library } from '@fortawesome/fontawesome-svg-core';
import { Doc } from "../../../fields/Doc";
import { StrCast, BoolCast } from "../../../fields/Types";

interface KeyValueProps {
    Document: Doc;
    remove: (self: ImportMetadataEntry) => void;
    next: () => void;
}

export const keyPlaceholder = "Key";
export const valuePlaceholder = "Value";

@observer
export default class ImportMetadataEntry extends React.Component<KeyValueProps> {

    private keyRef = React.createRef<EditableView>();
    private valueRef = React.createRef<EditableView>();
    private checkRef = React.createRef<HTMLInputElement>();

    constructor(props: KeyValueProps) {
        super(props);
        library.add(faPlus);
    }

    @computed
    public get valid() {
        return (this.key.length > 0 && this.key !== keyPlaceholder) && (this.value.length > 0 && this.value !== valuePlaceholder);
    }

    @computed
    private get backing() {
        return this.props.Document;
    }

    @computed
    public get onDataDoc() {
        return BoolCast(this.backing.checked);
    }

    public set onDataDoc(value: boolean) {
        this.backing.checked = value;
    }

    @computed
    public get key() {
        return StrCast(this.backing.key);
    }

    public set key(value: string) {
        this.backing.key = value;
    }

    @computed
    public get value() {
        return StrCast(this.backing.value);
    }

    public set value(value: string) {
        this.backing.value = value;
    }

    @action
    updateKey = (newKey: string) => {
        this.key = newKey;
        this.keyRef.current && this.keyRef.current.setIsFocused(false);
        this.valueRef.current && this.valueRef.current.setIsFocused(true);
        this.key.length === 0 && (this.key = keyPlaceholder);
        return true;
    }

    @action
    updateValue = (newValue: string, shiftDown: boolean) => {
        this.value = newValue;
        this.valueRef.current && this.valueRef.current.setIsFocused(false);
        this.value.length > 0 && shiftDown && this.props.next();
        this.value.length === 0 && (this.value = valuePlaceholder);
        return true;
    }

    render() {
        const keyValueStyle: React.CSSProperties = {
            paddingLeft: 10,
            width: "50%",
            opacity: this.valid ? 1 : 0.5,
        };
        return (
            <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    paddingBottom: 5,
                    paddingRight: 5,
                    justifyContent: "center",
                    alignItems: "center",
                    alignContent: "center"
                }}
            >
                <input
                    onChange={e => this.onDataDoc = e.target.checked}
                    ref={this.checkRef}
                    style={{ margin: "0 10px 0 15px" }}
                    type="checkbox"
                    title={"Add to Data Document?"}
                    checked={this.onDataDoc}
                />
                <div className={"key_container"} style={keyValueStyle}>
                    <EditableView
                        ref={this.keyRef}
                        contents={this.key}
                        SetValue={this.updateKey}
                        GetValue={() => ""}
                        oneLine={true}
                    />
                </div>
                <div
                    className={"value_container"}
                    style={keyValueStyle}>
                    <EditableView
                        ref={this.valueRef}
                        contents={this.value}
                        SetValue={this.updateValue}
                        GetValue={() => ""}
                        oneLine={true}
                    />
                </div>
                <div onClick={() => this.props.remove(this)} title={"Delete Entry"}>
                    <FontAwesomeIcon
                        icon={faPlus}
                        color={"red"}
                        size={"1x"}
                        style={{
                            marginLeft: 15,
                            marginRight: 15,
                            transform: "rotate(45deg)"
                        }}
                    />
                </div>
            </div>
        );
    }

}