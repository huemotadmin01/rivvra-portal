// Rivvra Logo Component - New "R" river logo
function RivvraLogo({ className = "w-5 h-5" }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}rivvra-logo.png`}
      alt="Rivvra"
      className={`${className} object-contain rounded-sm`}
      draggable={false}
    />
  );
}

export default RivvraLogo;
