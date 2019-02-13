import React = require('react')
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';

export interface EditableProps {
    GetValue(): string;
    SetValue(value: string): boolean;
    contents: any;
}

@observer
export class EditableView extends React.Component<EditableProps> {
    @observable
    editing: boolean = false;

    @action
    onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key == "Enter" && !e.ctrlKey) {
            this.props.SetValue(e.currentTarget.value);
            this.editing = false;
        } else if (e.key == "Escape") {
            this.editing = false;
        }
    }

    render() {
        if (this.editing) {
            return <input defaultValue={this.props.GetValue()} onKeyDown={this.onKeyDown} autoFocus onBlur={action(() => this.editing = false)}
                style={{ width: "100%" }}></input>
        } else {
            return (
                <div style={{ alignItems: "center", display: "flex", height: "100%", maxHeight: "35px" }} >
                    <button style={{ width: "100%" }} onClick={action(() => this.editing = true)}>
                        {this.props.contents}
                    </button>
                </div>
            )
        }
    }
}