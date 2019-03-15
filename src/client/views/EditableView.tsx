import React = require('react')
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';
import "./EditableView.scss"

export interface EditableProps {
    /**
     * Called to get the initial value for editing
     *  */
    GetValue(): string;

    /**
     * Called to apply changes
     * @param value - The string entered by the user to set the value to
     * @returns `true` if setting the value was successful, `false` otherwise
     *  */
    SetValue(value: string): boolean;

    /**
     * The contents to render when not editing
     */
    contents: any;
    height: number
}

/**
 * Customizable view that can be given an arbitrary view to render normally,
 * but can also be edited with customizable functions to get a string version
 * of the content, and set the value based on the entered string.
 */
@observer
export class EditableView extends React.Component<EditableProps> {
    @observable
    editing: boolean = false;

    @action
    onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key == "Enter" && !e.ctrlKey) {
            if (this.props.SetValue(e.currentTarget.value)) {
                this.editing = false;
            }
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
                <div className="editableView-container-editing" style={{ display: "inline", height: "auto", maxHeight: `${this.props.height}` }}
                    onClick={action(() => this.editing = true)}>
                    {this.props.contents}
                </div>
            )
        }
    }
}