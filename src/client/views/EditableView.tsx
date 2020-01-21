import React = require('react');
import { observer } from 'mobx-react';
import { observable, action, trace } from 'mobx';
import "./EditableView.scss";
import * as Autosuggest from 'react-autosuggest';
import { undoBatch } from '../util/UndoManager';
import { SchemaHeaderField } from '../../new_fields/SchemaHeaderField';
import { ObjectField } from '../../new_fields/ObjectField';

export interface EditableProps {
    /**
     * Called to get the initial value for editing
     *  */
    GetValue(): string | undefined;

    /**
     * Called to apply changes
     * @param value - The string entered by the user to set the value to
     * @returns `true` if setting the value was successful, `false` otherwise
     *  */
    SetValue(value: string, shiftDown?: boolean): boolean;

    OnFillDown?(value: string): void;

    OnTab?(shift?: boolean): void;

    /**
     * The contents to render when not editing
     */
    contents: any;
    fontStyle?: string;
    fontSize?: number;
    height?: number | "auto";
    maxHeight?: number;
    display?: string;
    autosuggestProps?: {
        resetValue: () => void;
        value: string,
        onChange: (e: React.ChangeEvent, { newValue }: { newValue: string }) => void,
        autosuggestProps: Autosuggest.AutosuggestProps<string, any>

    };
    oneLine?: boolean;
    editing?: boolean;
    onClick?: (e: React.MouseEvent) => boolean;
    isEditingCallback?: (isEditing: boolean) => void;
    HeadingObject?: SchemaHeaderField | undefined;
    HeadingsHack?: number;
    toggle?: () => void;
    color?: string | undefined;
}

/**
 * Customizable view that can be given an arbitrary view to render normally,
 * but can also be edited with customizable functions to get a string version
 * of the content, and set the value based on the entered string.
 */
@observer
export class EditableView extends React.Component<EditableProps> {
    @observable _editing: boolean = false;
    @observable _headingsHack: number = 1;

    constructor(props: EditableProps) {
        super(props);
        this._editing = this.props.editing ? true : false;
    }

    @action
    componentWillReceiveProps(nextProps: EditableProps) {
        // this is done because when autosuggest is turned on, the suggestions are passed in as a prop,
        // so when the suggestions are passed in, and no editing prop is passed in, it used to set it
        // to false. this will no longer do so -syip
        if (nextProps.editing && nextProps.editing !== this._editing) {
            this._editing = nextProps.editing;
        }
    }

    @action
    onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Tab") {
            e.stopPropagation();
            this.finalizeEdit(e.currentTarget.value, e.shiftKey);
            this.props.OnTab && this.props.OnTab(e.shiftKey);
        } else if (e.key === "Enter") {
            e.stopPropagation();
            if (!e.ctrlKey) {
                this.finalizeEdit(e.currentTarget.value, e.shiftKey);
            } else if (this.props.OnFillDown) {
                this.props.OnFillDown(e.currentTarget.value);
                this._editing = false;
                this.props.isEditingCallback && this.props.isEditingCallback(false);
            }
        } else if (e.key === "Escape") {
            e.stopPropagation();
            this._editing = false;
            this.props.isEditingCallback && this.props.isEditingCallback(false);
        }
    }

    @action
    onClick = (e: React.MouseEvent) => {
        e.nativeEvent.stopPropagation();
        if (!this.props.onClick || !this.props.onClick(e)) {
            this._editing = true;
            this.props.isEditingCallback && this.props.isEditingCallback(true);
        }
        e.stopPropagation();
    }

    @action
    private finalizeEdit(value: string, shiftDown: boolean) {
        this._editing = false;
        if (this.props.SetValue(value, shiftDown)) {
            this.props.isEditingCallback && this.props.isEditingCallback(false);
        }
    }

    stopPropagation(e: React.SyntheticEvent) {
        e.stopPropagation();
    }

    @action
    setIsFocused = (value: boolean) => {
        const wasFocused = this._editing;
        this._editing = value;
        return wasFocused !== this._editing;
    }

    render() {
        if (this._editing && this.props.GetValue() !== undefined) {
            return this.props.autosuggestProps
                ? <Autosuggest
                    {...this.props.autosuggestProps.autosuggestProps}
                    inputProps={{
                        className: "editableView-input",
                        onKeyDown: this.onKeyDown,
                        autoFocus: true,
                        onBlur: e => this.finalizeEdit(e.currentTarget.value, false),
                        onPointerDown: this.stopPropagation,
                        onClick: this.stopPropagation,
                        onPointerUp: this.stopPropagation,
                        value: this.props.autosuggestProps.value,
                        onChange: this.props.autosuggestProps.onChange
                    }}
                />
                : <input className="editableView-input"
                    defaultValue={this.props.GetValue()}
                    onKeyDown={this.onKeyDown}
                    autoFocus={true}
                    onBlur={e => this.finalizeEdit(e.currentTarget.value, false)}
                    onPointerDown={this.stopPropagation} onClick={this.stopPropagation} onPointerUp={this.stopPropagation}
                    style={{ display: this.props.display, fontSize: this.props.fontSize }}
                />;
        } else {
            if (this.props.autosuggestProps) this.props.autosuggestProps.resetValue();
            return (this.props.contents instanceof ObjectField ? (null) :
                <div className={`editableView-container-editing${this.props.oneLine ? "-oneLine" : ""}`}
                    style={{ display: this.props.display, minHeight: "20px", height: `${this.props.height ? this.props.height : "auto"}`, maxHeight: `${this.props.maxHeight}` }}
                    onClick={this.onClick}>
                    <span style={{ fontStyle: this.props.fontStyle, fontSize: this.props.fontSize }}>{this.props.contents}</span>
                </div>
            );
        }
    }
}