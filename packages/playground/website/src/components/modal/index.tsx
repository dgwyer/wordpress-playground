import ReactModal from 'react-modal';
import css from './style.module.css';

ReactModal.setAppElement('#root');

interface ModalProps extends ReactModal.Props {
	mergeStyles?: boolean;
}
export const defaultStyles: ReactModal.Styles = {
	content: {
		top: '50%',
		left: '50%',
		right: 'auto',
		bottom: 'auto',
		marginRight: '-50%',
		transform: 'translate(-50%, -50%)',
		width: 400,
		zIndex: 200,
		textAlign: 'center',
		color: '#000',
		border: '#000 1px solid',
		borderRadius: '6px',
		background: '#fff',
	},
	overlay: {
		background: '#1e2327d0',
	},
};
export default function Modal(props: ModalProps) {
	return (
		<ReactModal style={defaultStyles} {...props}>
			<div className={css.modalInner}>
				<button
					id="import-close-modal--btn"
					onClick={props.onRequestClose}
					className={`${css.btn} ${css.btnClose}`}
					aria-label="Close import window"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						width="32"
						height="32"
						aria-hidden="true"
						focusable="false"
					>
						<path d="M13 11.8l6.1-6.3-1-1-6.1 6.2-6.1-6.2-1 1 6.1 6.3-6.5 6.7 1 1 6.5-6.6 6.5 6.6 1-1z"></path>
					</svg>
				</button>
				{props.children}
			</div>
		</ReactModal>
	);
}
