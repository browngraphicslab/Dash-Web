import React = require("react");
import { observer } from "mobx-react";
import { EditableView } from "../../views/EditableView";
import { observable, action } from "mobx";

interface KeyValueProps {
    remove: (self: KeyValue) => void;
}

@observer
export default class KeyValue extends React.Component<KeyValueProps> {
    @observable public key = "Key";
    @observable public value = "Value";

    @action
    updateKey = (newKey: string) => {
        this.key = newKey;
        return true;
    }

    @action
    updateValue = (newValue: string) => {
        this.value = newValue;
        return true;
    }

    render() {
        let keyValueStyle = { paddingLeft: 10, width: "50%" };
        let keySpecified = (this.key.length > 0 && this.key !== "Key");
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
                onClick={() => this.props.remove(this)}
            >
                <input type="checkbox" />
                <div className={"key_container"} style={keyValueStyle}>
                    <EditableView
                        contents={this.key}
                        SetValue={this.updateKey}
                        GetValue={() => this.key}
                        oneLine={true}
                    />
                </div>
                <div
                    className={"value_container"}
                    style={{
                        opacity: keySpecified ? 1 : 0.5,
                        pointerEvents: keySpecified ? "all" : "none",
                        ...keyValueStyle
                    }}>
                    <EditableView
                        contents={this.value}
                        SetValue={this.updateValue}
                        GetValue={() => this.value}
                        oneLine={true}
                    />
                </div>
                <div style={{
                    borderRadius: "50%",
                    width: 10,
                    height: 10,
                    background: "red",
                    marginLeft: 15,
                    marginRight: 15
                }} />

            </div>
        );
    }

}