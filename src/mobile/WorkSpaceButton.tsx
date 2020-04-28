import React = require('react');
import { observer } from "mobx-react";
import { observable } from 'mobx';
import { Doc } from '../new_fields/Doc';

interface IProps {
    open: boolean;
}

@observer
export class MenuButton extends React.Component<IProps> {
    @observable static Instance: MenuButton;


}