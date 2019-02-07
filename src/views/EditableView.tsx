import React = require('react')
import { observer } from 'mobx-react';
import { observable } from 'mobx';

export interface EditableProps {
    GetValue(): string;
    SetValue(value: string): boolean;
    contents: any;
}

@observer
export class EditableView extends React.Component<EditableProps> {
    @observable
    editing: boolean = false;

    onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key == "Enter" && !e.ctrlKey) {
            this.props.SetValue(e.currentTarget.value);
            this.editing = false;
        }
    }

    render() {
        if (this.editing) {
            return <input value={this.props.GetValue()} onKeyDown={this.onKeyDown}></input>
        } else {
            return (
                <div>
                    {this.props.contents}
                    <button onClick={() => this.editing = true}>Edit</button>
                </div>
            )
        }
    }
}