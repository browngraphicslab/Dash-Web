import * as React from "react";
import { observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { PastelSchemaPalette } from "../../../new_fields/SchemaHeaderField";

interface IKeyRestrictionProps {
    contains: boolean;
    script: (value: string) => void;
}

@observer
export default class KeyRestrictionRow extends React.Component<IKeyRestrictionProps> {
    @observable private _key = "";
    @observable private _value = "";
    @observable private _contains = this.props.contains;

    render() {
        if (this._key && this._value) {
            let parsedValue: string | number = `"${this._value}"`;
            let parsed = parseInt(this._value);
            let type = "string";
            if (!isNaN(parsed)) {
                parsedValue = parsed;
                type = "number";
            }
            let scriptText = `${this._contains ? "" : "!"}((doc.${this._key} as ${type})${type === "string" ? ".includes" : "<="}(${parsedValue}))`;
            this.props.script(scriptText);
        }
        else {
            this.props.script("");
        }

        return (
            <div className="collectionViewBaseChrome-viewSpecsMenu-row">
                <input className="collectionViewBaseChrome-viewSpecsMenu-rowLeft"
                    value={this._key}
                    onChange={(e) => runInAction(() => this._key = e.target.value)}
                    placeholder="KEY" />
                <button className="collectionViewBaseChrome-viewSpecsMenu-rowMiddle"
                    style={{ background: this._contains ? "#77dd77" : "#ff6961" }}
                    onClick={() => runInAction(() => this._contains = !this._contains)}>
                    {this._contains ? "CONTAINS" : "DOES NOT CONTAIN"}
                </button>
                <input className="collectionViewBaseChrome-viewSpecsMenu-rowRight"
                    value={this._value}
                    onChange={(e) => runInAction(() => this._value = e.target.value)}
                    placeholder="VALUE" />
            </div>
        );
    }
}