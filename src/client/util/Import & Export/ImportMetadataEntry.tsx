import React = require("react");
import { observer } from "mobx-react";
import { EditableView } from "../../views/EditableView";
import { observable, action, computed } from "mobx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { library } from '@fortawesome/fontawesome-svg-core';
import { Opt } from "../../../new_fields/Doc";

interface KeyValueProps {
    remove: (self: ImportMetadataEntry) => void;
    next: () => void;
}

const keyPlaceholder = "Key";
const valuePlaceholder = "Value";

@observer
export default class ImportMetadataEntry extends React.Component<KeyValueProps> {
    @observable public key = keyPlaceholder;
    @observable public value = valuePlaceholder;

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

    public get onDataDoc() {
        return this.checkRef.current && this.checkRef.current.checked;
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
        let keyValueStyle: React.CSSProperties = {
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
                    ref={this.checkRef}
                    style={{ margin: "0 10px 0 15px" }}
                    type="checkbox"
                    title={"Add to Data Document?"}
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