import * as React from "react";
import { observable, action, runInAction, computed } from "mobx";
import { SelectionManager } from "./SelectionManager";
import MainViewModal from "../views/MainViewModal";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../fields/Doc";
import { List } from "../../fields/List";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as fa from '@fortawesome/free-solid-svg-icons';
import { library } from "@fortawesome/fontawesome-svg-core";
import SharingManager, { User } from "./SharingManager";
import { Utils } from "../../Utils";
import * as RequestPromise from "request-promise";
import Select from 'react-select';

library.add(fa.faWindowClose);

@observer
export default class GroupManager extends React.Component<{}> {

    static Instance: GroupManager;
    @observable private isOpen: boolean = false; // whether the menu is open or not
    @observable private dialogueBoxOpacity: number = 1;
    @observable private overlayOpacity: number = 0.4;
    @observable private users: string[] = [];
    @observable private selectedUsers: string[] | null = null;

    constructor(props: Readonly<{}>) {
        super(props);
        GroupManager.Instance = this;
    }

    componentDidMount() {
        console.log("mounted");
    }

    populateUsers = async () => {
        const userList: User[] = JSON.parse(await RequestPromise.get(Utils.prepend("/getUsers")));
        const currentUserIndex = userList.findIndex(user => user.email === Doc.CurrentUserEmail);
        currentUserIndex !== -1 && userList.splice(currentUserIndex, 1);
        return userList.map(user => user.email);
    }

    @computed get options() {
        return this.users.map(user => ({ label: user, value: user }));
    }

    open = action(() => {
        SelectionManager.DeselectAll();
        this.isOpen = true;
        this.populateUsers().then(resolved => runInAction(() => this.users = resolved));
    });

    close = action(() => {
        this.isOpen = false;
    });

    get GroupManagerDoc(): Doc | undefined {
        return Doc.UserDoc().globalGroupDatabase as Doc;
    }

    getAllGroups(): Doc[] {
        const groupDoc = GroupManager.Instance.GroupManagerDoc;
        return groupDoc ? DocListCast(groupDoc.data) : [];
    }

    getGroup(groupName: string): Doc | undefined {
        const groupDoc = GroupManager.Instance.getAllGroups().find(group => group.name === groupName);
        return groupDoc;
    }

    get adminGroupMembers(): string[] {
        return JSON.parse(GroupManager.Instance.getGroup("admin")!.members as string);
    }

    hasEditAccess(groupDoc: Doc): boolean {
        const accessList: string[] = JSON.parse(groupDoc.owners as string);
        return accessList.includes(Doc.CurrentUserEmail) || GroupManager.Instance.adminGroupMembers.includes(Doc.CurrentUserEmail);
    }

    createGroupDoc(groupName: string, memberEmails: string[]) {
        const groupDoc = new Doc;
        groupDoc.groupName = groupName;
        groupDoc.owners = JSON.stringify([Doc.CurrentUserEmail]);
        groupDoc.members = JSON.stringify(memberEmails);
        this.addGroup(groupDoc);
    }

    addGroup(groupDoc: Doc): boolean {
        // const groupList = GroupManager.Instance.getAllGroups();
        // groupList.push(groupDoc);
        if (GroupManager.Instance.GroupManagerDoc) {
            Doc.AddDocToList(GroupManager.Instance.GroupManagerDoc, "data", groupDoc);
            // GroupManager.Instance.GroupManagerDoc.data = new List<Doc>(groupList);
            return true;
        }
        return false;
    }

    deleteGroup(groupName: string): boolean {
        // const groupList = GroupManager.Instance.getAllGroups();
        // const index = groupList.indexOf(groupDoc);
        // if (index !== -1) {
        // groupList.splice(index, 1);
        const groupDoc = GroupManager.Instance.getGroup(groupName);
        if (groupDoc) {
            if (GroupManager.Instance.GroupManagerDoc && GroupManager.Instance.hasEditAccess(groupDoc)) {
                // GroupManager.Instance.GroupManagerDoc.data = new List<Doc>(groupList);
                Doc.RemoveDocFromList(GroupManager.Instance.GroupManagerDoc, "data", groupDoc);
                return true;
            }
        }


        return false;
    }

    addMemberToGroup(groupDoc: Doc, email: string) {
        if (GroupManager.Instance.hasEditAccess(groupDoc)) {
            const memberList: string[] = JSON.parse(groupDoc.members as string);
            !memberList.includes(email) && memberList.push(email);
            groupDoc.members = JSON.stringify(memberList);
        }
    }

    removeMemberFromGroup(groupDoc: Doc, email: string) {
        if (GroupManager.Instance.hasEditAccess(groupDoc)) {
            const memberList: string[] = JSON.parse(groupDoc.members as string);
            const index = memberList.indexOf(email);
            index !== -1 && memberList.splice(index, 1);
            groupDoc.members = JSON.stringify(memberList);
        }
    }

    @action
    handleChange = (selectedOptions: any) => {
        const castOptions = selectedOptions as { label: string, value: string }[];
        console.log(castOptions);
        this.selectedUsers = castOptions.map(option => option.value);
    }

    @action
    resetSelection = () => {
        console.log(this.selectedUsers?.[0]);
        this.selectedUsers = null;
    }

    createGroup = () => {
        this.selectedUsers = null;
    }

    private get groupInterface() {
        return (
            <div className="settings-interface">
                <div className="settings-heading">
                    <h1>Groups</h1>
                    <div className={"close-button"} onClick={this.close}>
                        <FontAwesomeIcon icon={fa.faWindowClose} size={"lg"} />
                    </div>
                    <button onClick={this.resetSelection} style={{ width: "50%" }}>Create group</button>
                </div>
                <span style={{ width: "50%" }}>
                    <Select
                        isMulti={true}
                        isSearchable={true}
                        options={this.options}
                        onChange={this.handleChange}
                        placeholder={"Select users"}
                        value={this.selectedUsers}
                    />
                </span>
                <span>
                    <input type="text" id="groupNameInput" />
                </span>
            </div>
        );
    }

    render() {
        return (
            <MainViewModal
                contents={this.groupInterface}
                isDisplayed={this.isOpen}
                interactive={true}
                dialogueBoxDisplayedOpacity={this.dialogueBoxOpacity}
                overlayDisplayedOpacity={this.overlayOpacity}
            />
        );
    }

}