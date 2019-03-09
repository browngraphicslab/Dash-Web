import React = require('react')
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';

export interface EditableProps {
    GetValue(): string;
    SetValue(value: string): boolean;
    contents: any;
    height: number
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
                style={{ display: "inline" }}></input>
        } else {
            return (
                <div className="editableView-container-editing" style={{ display: "inline", height: "100%", maxHeight: `${this.props.height}` }}
                    onClick={action(() => this.editing = true)}>
                    {this.props.contents}
                </div>
            )
        }
    }
}